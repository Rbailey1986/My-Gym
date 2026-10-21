// openGym for Windows: the Tauri shell around the frontend's desktop build (VITE_DESKTOP=1).
//
// The web app runs exactly as the phone app does — no server, no account, no sync. What the
// phone gets from Capacitor plugins it gets from here instead (see frontend/src/desktop/):
//
//   fs_*               real files for the state mirror, the Coach's device file, auto-backups
//   save_to_downloads  where a backup export ends up (the phone shares it; we save it)
//   local_http         the Coach's calls to a model on this computer — loopback addresses only
//   media://           the exercise stills and animations, served from the install folder
//
// Nothing in this file can reach the internet: local_http refuses every host that is not
// localhost / 127.x / ::1, and nothing else opens a socket.
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Serialize;
use std::borrow::Cow;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Manager};

type Res<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/* ------------------------------------------------------------------ files -- */

// The shim's Directory names → folders. DATA is %APPDATA%\<identifier>, CACHE is
// %LOCALAPPDATA%\<identifier>, DOCUMENTS the user's Documents folder.
fn base_dir(app: &AppHandle, dir: &str) -> Res<PathBuf> {
    let p = app.path();
    match dir {
        "DATA" => p.app_data_dir(),
        "CACHE" => p.app_cache_dir(),
        "DOCUMENTS" => p.document_dir(),
        other => return Err(format!("unknown directory: {other}")),
    }
    .map_err(err)
}

// A path from the page is always relative to its directory and may not climb out of it.
fn resolve(app: &AppHandle, dir: &str, rel: &str) -> Res<PathBuf> {
    let rel = Path::new(rel);
    if rel
        .components()
        .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return Err(format!("path not allowed: {}", rel.display()));
    }
    Ok(base_dir(app, dir)?.join(rel))
}

fn uri_of(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

#[tauri::command]
fn fs_read(app: AppHandle, dir: String, path: String, utf8: bool) -> Res<String> {
    let bytes = fs::read(resolve(&app, &dir, &path)?).map_err(err)?;
    if utf8 {
        String::from_utf8(bytes).map_err(err)
    } else {
        Ok(B64.encode(bytes))
    }
}

// A whole-file write goes to a temporary file first and is renamed into place, so a crash
// mid-write never leaves a half-written state mirror behind.
#[tauri::command]
fn fs_write(app: AppHandle, dir: String, path: String, data: String, utf8: bool, append: bool) -> Res<String> {
    let target = resolve(&app, &dir, &path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let bytes = if utf8 { data.into_bytes() } else { B64.decode(data).map_err(err)? };
    if append {
        let mut f = fs::OpenOptions::new().create(true).append(true).open(&target).map_err(err)?;
        f.write_all(&bytes).map_err(err)?;
    } else {
        let mut tmp = target.clone().into_os_string();
        tmp.push(".tmp");
        let tmp = PathBuf::from(tmp);
        fs::write(&tmp, &bytes).map_err(err)?;
        fs::rename(&tmp, &target).map_err(err)?;
    }
    Ok(uri_of(&target))
}

#[tauri::command]
fn fs_delete(app: AppHandle, dir: String, path: String) -> Res<()> {
    fs::remove_file(resolve(&app, &dir, &path)?).map_err(err)
}

#[tauri::command]
fn fs_mkdir(app: AppHandle, dir: String, path: String) -> Res<()> {
    fs::create_dir_all(resolve(&app, &dir, &path)?).map_err(err)
}

#[derive(Serialize)]
struct Entry {
    name: String,
    #[serde(rename = "type")]
    kind: &'static str,
    size: u64,
    mtime: u64,
    uri: String,
}

fn entry(p: &Path) -> Res<Entry> {
    let m = fs::metadata(p).map_err(err)?;
    Ok(Entry {
        name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        kind: if m.is_dir() { "directory" } else { "file" },
        size: m.len(),
        mtime: m
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        uri: uri_of(p),
    })
}

#[tauri::command]
fn fs_readdir(app: AppHandle, dir: String, path: String) -> Res<Vec<Entry>> {
    let mut out = Vec::new();
    for e in fs::read_dir(resolve(&app, &dir, &path)?).map_err(err)? {
        out.push(entry(&e.map_err(err)?.path())?);
    }
    Ok(out)
}

#[tauri::command]
fn fs_stat(app: AppHandle, dir: String, path: String) -> Res<Entry> {
    entry(&resolve(&app, &dir, &path)?)
}

#[tauri::command]
fn fs_uri(app: AppHandle, dir: String, path: String) -> Res<String> {
    Ok(uri_of(&resolve(&app, &dir, &path)?))
}

#[tauri::command]
fn fs_rename(app: AppHandle, dir: String, from: String, to_dir: String, to: String) -> Res<()> {
    let target = resolve(&app, &to_dir, &to)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(resolve(&app, &dir, &from)?, target).map_err(err)
}

// A backup export: the page stages it in the cache folder, this copies it into Downloads
// (never over an existing file) and shows it selected in Explorer.
#[tauri::command]
fn save_to_downloads(app: AppHandle, path: String) -> Res<String> {
    let src = PathBuf::from(&path);
    let cache = app.path().app_cache_dir().map_err(err)?;
    if !src.starts_with(&cache) {
        return Err("only staged exports can be saved".into());
    }
    let name = src.file_name().ok_or("no file name")?.to_string_lossy().into_owned();
    let downloads = app.path().download_dir().map_err(err)?;
    fs::create_dir_all(&downloads).map_err(err)?;
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) => (s.to_string(), format!(".{e}")),
        None => (name.clone(), String::new()),
    };
    let mut dest = downloads.join(&name);
    let mut n = 2;
    while dest.exists() {
        dest = downloads.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    fs::copy(&src, &dest).map_err(err)?;
    let _ = fs::remove_file(&src);
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(format!("/select,{}", dest.display())).spawn();
    }
    Ok(uri_of(&dest))
}

/* ------------------------------------------------------- the Coach's calls -- */

#[derive(Serialize)]
struct HttpResponse {
    status: u16,
    body: String,
}

fn is_loopback(host: &str) -> bool {
    let h = host.trim_start_matches('[').trim_end_matches(']');
    h.eq_ignore_ascii_case("localhost")
        || h.parse::<std::net::IpAddr>().map(|ip| ip.is_loopback()).unwrap_or(false)
}

// The Coach's provider calls (Ollama's OpenAI-compatible API). Made here rather than from the
// page because the page's origin is not one Ollama's CORS rules allow — and refused for any
// host that is not this computer, which is what keeps the desktop build offline.
#[tauri::command]
async fn local_http(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Res<HttpResponse> {
    let parsed = reqwest::Url::parse(&url).map_err(err)?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("only http:// and https:// are allowed".into());
    }
    if !parsed.host_str().map(is_loopback).unwrap_or(false) {
        return Err("only a model on this computer (localhost) can be reached".into());
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        // The job timeout is the page's (lib/coach-local.js); this only has to be longer.
        .timeout(Duration::from_secs(40 * 60))
        .build()
        .map_err(err)?;
    let method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes()).map_err(err)?;
    let mut req = client.request(method, parsed);
    for (k, v) in &headers {
        req = req.header(k, v);
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let res = req.send().await.map_err(err)?;
    let status = res.status().as_u16();
    let body = res.text().await.map_err(err)?;
    Ok(HttpResponse { status, body })
}

/* ------------------------------------------------------- exercise media -- */

// media://still/1234.webp and media://clip/1234.mp4 (http://media.localhost/... in WebView2),
// from the exercise-media folder installed next to the app. Only those two folders, only
// file names of the catalogue's own shape.
fn serve_media(app: &AppHandle, path: &str) -> Response<Cow<'static, [u8]>> {
    let not_found = || {
        Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Cow::Borrowed(&[][..]))
            .unwrap()
    };
    let path = path.trim_start_matches('/');
    let Some((folder, name)) = path.split_once('/') else { return not_found() };
    let (allowed, mime) = match (folder, name.rsplit_once('.').map(|(_, e)| e)) {
        ("still", Some("webp")) => (true, "image/webp"),
        ("clip", Some("mp4")) => (true, "video/mp4"),
        ("clip", Some("webp")) => (true, "image/webp"),
        _ => (false, ""),
    };
    if !allowed || name.contains(['/', '\\']) || name.starts_with('.') {
        return not_found();
    }
    let Ok(res_dir) = app.path().resource_dir() else { return not_found() };
    match fs::read(res_dir.join("exercise-media").join(folder).join(name)) {
        Ok(bytes) => Response::builder()
            .header(header::CONTENT_TYPE, mime)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::CACHE_CONTROL, "max-age=31536000, immutable")
            .body(Cow::Owned(bytes))
            .unwrap(),
        Err(_) => not_found(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("media", |ctx, request| serve_media(ctx.app_handle(), request.uri().path()))
        .invoke_handler(tauri::generate_handler![
            fs_read,
            fs_write,
            fs_delete,
            fs_mkdir,
            fs_readdir,
            fs_stat,
            fs_uri,
            fs_rename,
            save_to_downloads,
            local_http
        ])
        .run(tauri::generate_context!())
        .expect("error while running openGym");
}
