// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "OpenGym",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .executable(name: "OpenGym", targets: ["OpenGym"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "OpenGym",
            dependencies: [],
            path: "Sources",
            resources: [
                .copy("Web")
            ]
        )
    ]
)
