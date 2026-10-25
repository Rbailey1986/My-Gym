// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "OpenGym",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "OpenGym", targets: ["OpenGym"])
    ],
    dependencies: [],
    targets: [
        .target(
            name: "OpenGym",
            dependencies: [],
            path: "Sources",
            resources: [
                .copy("Web")
            ]
        )
    ]
)
