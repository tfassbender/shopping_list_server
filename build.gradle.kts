// Version of the app (also shown by /api/health via shoppinglist.info.version, and in frontend/package.json).
allprojects {
    group = "com.tfassbender.shoppinglist"
    version = "1.0.0"
}

// Packaging the SPA: `./gradlew :backend:build -PwithFrontend` builds the React app and puts it into the
// backend JAR (see backend/build.gradle.kts), so one JAR serves API + web app.

// --- Docker image for the server (doc/deployment.md) -------------------------------------------------------
// ./gradlew dockerImage builds the image (the Dockerfile builds the web app and the backend itself) and puts
// everything for the server into build/docker/: the image as shopping-list-<version>.tar.gz, plus start.sh,
// stop.sh, backup.sh, docker-compose.yml and the two config templates (needed on the server only once).
// Run the tests first (./gradlew build -PwithFrontend) - the image build skips them.

// Docker Desktop on Windows doesn't always put its CLI on the PATH (e.g. of the Gradle daemon); the CLI
// also needs its folder on the PATH for its credential helper.
val dockerBinDir: File? = listOfNotNull(
    System.getenv("LOCALAPPDATA")?.let { "$it/Programs/DockerDesktop/resources/bin" },
    "C:/Program Files/Docker/Docker/resources/bin",
).map(::File).firstOrNull { File(it, "docker.exe").exists() }
val dockerCli: String = dockerBinDir?.let { File(it, "docker.exe").path } ?: "docker"
val dockerPath: String = listOfNotNull(dockerBinDir?.path, System.getenv("PATH")).joinToString(File.pathSeparator)

val dockerBuild by tasks.registering(Exec::class) {
    group = "deployment"
    description = "Builds the Docker image shopping-list:<version> (and :latest)"
    commandLine(dockerCli, "build", "-t", "shopping-list:$version", "-t", "shopping-list:latest", ".")
    environment("PATH", dockerPath)
}

tasks.register("dockerImage") {
    group = "deployment"
    description = "Builds the Docker image and saves it with the server files in build/docker/"
    dependsOn(dockerBuild)
    val output = layout.buildDirectory.dir("docker")
    val serverFiles = listOf(
        "deploy/start.sh", "deploy/stop.sh", "deploy/backup.sh", "docker-compose.yml",
        "deploy/env.example", "deploy/application.properties.example",
    ).map { rootProject.file(it) }
    val imageVersion = version.toString()
    doLast {
        val dir = output.get().asFile
        dir.deleteRecursively()
        dir.mkdirs()
        val tar = File(dir, "image.tar")
        val save = ProcessBuilder(dockerCli, "save", "-o", tar.path, "shopping-list:$imageVersion", "shopping-list:latest")
            .inheritIO().apply { environment()["PATH"] = dockerPath }.start()
        check(save.waitFor() == 0) { "docker save failed" }
        val image = File(dir, "shopping-list-$imageVersion.tar.gz")
        java.util.zip.GZIPOutputStream(image.outputStream().buffered()).use { gzip -> tar.inputStream().use { it.copyTo(gzip) } }
        tar.delete()
        serverFiles.forEach { it.copyTo(File(dir, it.name)) }
        logger.lifecycle("Image: ${image.path} (${image.length() / 1_000_000} MB)")
        logger.lifecycle("Upload the image to the app directory on the server and run ./start.sh there.")
    }
}
