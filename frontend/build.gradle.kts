// Gradle wrapper around npm. node_modules is deliberately not declared as task input/output:
// fingerprinting tens of thousands of files makes the Gradle daemon slow. A marker file is used instead.

val npmInstallMarker = layout.buildDirectory.file("npm-install.marker")
val isWindows = System.getProperty("os.name").lowercase().contains("windows")

fun npm(vararg args: String): List<String> =
    if (isWindows) listOf("cmd", "/c", "npm", *args) else listOf("npm", *args)

tasks.register<Exec>("npmInstall") {
    group = "frontend"
    workingDir = projectDir
    commandLine(npm("install"))
    inputs.file("package.json")
    inputs.file("package-lock.json").optional()
    outputs.file(npmInstallMarker)
    // Re-run if node_modules was removed even though the marker survived.
    outputs.upToDateWhen { file("node_modules").isDirectory }
    doLast {
        val marker = npmInstallMarker.get().asFile
        marker.parentFile.mkdirs()
        marker.writeText("installed")
    }
}

tasks.register<Exec>("npmBuild") {
    group = "frontend"
    dependsOn("npmInstall")
    workingDir = projectDir
    commandLine(npm("run", "build"))
    inputs.dir("src")
    inputs.files("index.html", "vite.config.ts", "tsconfig.json", "package.json")
    outputs.dir("dist")
}

tasks.register<Exec>("npmTest") {
    group = "frontend"
    dependsOn("npmInstall")
    workingDir = projectDir
    commandLine(npm("test"))
}

// `npm run dev` is better started directly (cd frontend && npm run dev): Gradle can't reliably stop
// the node process tree on Windows.

tasks.register("build") {
    group = "build"
    dependsOn("npmBuild", "check")
}

tasks.register("check") {
    group = "verification"
    dependsOn("npmTest")
}
