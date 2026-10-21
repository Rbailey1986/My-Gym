// Desktop build only: the Coach runs against a model on this computer — Ollama, LM Studio or any
// other OpenAI-compatible server listening on localhost. No API key, no cloud provider, and no
// server to hand the job to: the Rust side refuses any address that is not loopback
// (desktop/src-tauri/src/lib.rs), so this screen only ever offers that.
//
// The pipeline is the phone's own-key one (lib/coach-local.js) with the provider fixed to
// 'compatible'; this screen only replaces the phone's provider and key pickers.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { CATEGORY_TEXT } from '../lib/coach.js'
import { validateBaseUrl } from '../../../api/coach/core/providers.js'
import { DATA_CATEGORIES } from '../../../api/coach/core/categories.js'
import Icon from '../components/Icon.jsx'
import { Section, Row, Button, TextField } from '../components/ui.jsx'

const DEFAULT_URL = 'http://localhost:11434'
// The model this build was set up with; any other one the endpoint serves can be picked.
const PREFERRED_MODEL = 'qwen3:8b'

const isLoopback = url => {
  try { return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(new URL(url).hostname) } catch { return false }
}
const pickDefault = models => (models.includes(PREFERRED_MODEL) ? PREFERRED_MODEL : models[0] || '')

export default function DesktopCoachSetup() {
  const nav = useNavigate()
  const coachLocal = useStore(s => s.coachLocal)
  const setCoachLocal = useStore(s => s.setCoachLocal)
  const toast = useUI(s => s.toast)

  const [baseUrl, setBaseUrl] = useState(coachLocal?.baseUrl || DEFAULT_URL)
  const [model, setModel] = useState(coachLocal?.model || '')
  const [models, setModels] = useState(null)
  const [status, setStatus] = useState(null)               // null | 'checking' | 'ok' | error text
  const [busy, setBusy] = useState(false)

  const checked = () => {
    const v = validateBaseUrl(baseUrl)
    if (!v.ok) { toast(v.error); return null }
    if (!v.value) { toast(t('Enter the endpoint URL')); return null }
    if (!isLoopback(v.value)) { toast('Only a model on this computer can be used: http://localhost:<port>'); return null }
    return v.value
  }

  const list = async () => {
    const url = checked()
    if (!url) return
    setBusy(true); setStatus('checking')
    try {
      const local = await import('../lib/coach-local.js')
      const r = await local.localModels({ provider: 'compatible', baseUrl: url }, null)
      if (!r.ok) { setModels(null); setStatus(r.error || t('Could not connect')); return }
      setModels(r.models)
      setStatus('ok')
      if (!model || !r.models.includes(model)) setModel(pickDefault(r.models))
    } catch (e) {
      setModels(null); setStatus(e?.message || t('Could not connect'))
    } finally { setBusy(false) }
  }
  // Look straight away: with Ollama running there is nothing to type at all.
  useEffect(() => { list() }, [])

  const save = async () => {
    const url = checked()
    if (!url) return
    if (!model) return toast(t('Pick a model'))
    setBusy(true)
    try {
      await setCoachLocal({ mode: 'byok', provider: 'compatible', model, baseUrl: url })
      toast(t('The Coach is on'))
      nav('/coach')
    } catch (e) {
      toast(e?.message || t('Could not connect'))
    } finally { setBusy(false) }
  }

  const turnOff = async () => {
    await setCoachLocal({ mode: 'off' })
    const local = await import('../lib/coach-local.js').catch(() => null)
    if (local) await local.localForget()
    toast(t('The Coach is off'))
  }

  const on = coachLocal?.mode === 'byok'
  const failed = status && status !== 'ok' && status !== 'checking'

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 10 }}><h1>{t('AI Coach')}</h1></div>
    </div>

    <Section title="Local model"
      footer={on ? `On: ${coachLocal.model} at ${coachLocal.baseUrl}` : 'Off. Pick a model on this computer to turn it on.'}>
      <Row icon="lock" iconTint="var(--acc)" title="Runs on this computer"
        subtitle="The Coach talks to Ollama (or another OpenAI-compatible server) on localhost. Nothing goes to the internet, and there is no API key." />
    </Section>

    <Section title={t('Endpoint')}
      footer={failed ? <span style={{ color: 'var(--red)' }}>{`Could not reach it: ${status}. Is Ollama running?`}</span> : null}>
      <div style={{ padding: '8px 12px' }}>
        <TextField value={baseUrl} placeholder={DEFAULT_URL} inputMode="url" autoCapitalize="none" autoCorrect="off"
          onChange={e => setBaseUrl(e.target.value)} />
      </div>
    </Section>

    {models && <Section title={t('Model')}
      footer={models.length ? null : 'Ollama is running but has no models. Download one first, for example: ollama pull qwen3:8b'}>
      <div style={{ padding: '8px 12px' }}>
        <select className="input" value={model} disabled={busy} onChange={e => setModel(e.target.value)} style={{ width: '100%' }}>
          {!model && <option value="">{t('Pick a model')}</option>}
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    </Section>}

    <Section title="What the model is sent">
      {DATA_CATEGORIES.map(k => {
        const [title, sub] = CATEGORY_TEXT[k]?.() || [k, '']
        return <Row key={k} icon="check" iconTint="var(--acc)" title={title} subtitle={sub} />
      })}
    </Section>

    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
      {models && models.length > 0 && <Button variant="primary" icon="check" disabled={busy || !model} onClick={save}>{t('Save and use the Coach')}</Button>}
      <Button variant={models ? undefined : 'primary'} icon="sparkles" disabled={busy} onClick={list}>
        {status === 'checking' ? t('Checking the endpoint…') : t('List models')}
      </Button>
    </div>

    {on && <Section title={t('Controls')}>
      <Row icon="signOut" iconTint="var(--red)" title="Turn the Coach off" danger onClick={turnOff} />
    </Section>}
  </div>
}
