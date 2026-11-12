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

/** The Vite dev server port (fixed via `strictPort` in vite.config.ts). */
val devPort = 5173

// The Vite dev server. Not an Exec task: stopping an Exec task kills only the `cmd` it started, and
// Windows leaves its children (npm → node/Vite) running, still holding the port. This task starts the
// process itself and, when Gradle cancels it (IDE stop button, Ctrl+C), ends the whole process tree.
// Should a server still be left over (e.g. the Gradle daemon was killed), run `npmDevStop`.
tasks.register("npmDev") {
    group = "frontend"
    description = "Run the Vite dev server on port $devPort (stopping the task stops the server)"
    dependsOn("npmInstall")
    val dir = projectDir
    val command = npm("run", "dev")
    doLast {
        val process = ProcessBuilder(command).directory(dir).redirectErrorStream(true).start()
        // Forward the server output to the Gradle console; a daemon thread so it never blocks stopping.
        val log = logger
        val pump = Thread { process.inputStream.bufferedReader().forEachLine { log.lifecycle(it) } }
            .apply { isDaemon = true }
        pump.start()
        try {
            val exit = process.waitFor()
            pump.join(2000)
            if (exit != 0) throw GradleException("Dev server exited with code $exit (port $devPort taken? run npmDevStop)")
        } finally {
            // Cancelling interrupts waitFor(). Snapshot the tree first, then kill children before the parent.
            val tree = process.descendants().toList()
            tree.forEach { it.destroyForcibly() }
            process.destroyForcibly()
        }
    }
}

// Frees the dev-server port from a server left running (kills the process tree listening on it).
tasks.register<Exec>("npmDevStop") {
    group = "frontend"
    description = "Stop a Vite dev server still holding port $devPort"
    if (isWindows) {
        commandLine(
            "powershell", "-NoProfile", "-Command",
            "\$pids = Get-NetTCPConnection -LocalPort $devPort -State Listen -ErrorAction SilentlyContinue | " +
                "Select-Object -ExpandProperty OwningProcess -Unique; " +
                "if (\$pids) { foreach (\$p in \$pids) { taskkill /PID \$p /T /F } } " +
                "else { Write-Output 'Nothing is listening on port $devPort.' }",
        )
    } else {
        commandLine("sh", "-c", "lsof -ti tcp:$devPort | xargs -r kill || echo 'Nothing is listening on port $devPort.'")
    }
}

tasks.register("build") {
    group = "build"
    dependsOn("npmBuild", "check")
}

tasks.register("check") {
    group = "verification"
    dependsOn("npmTest")
}
