plugins {
    kotlin("jvm")
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("io.rest-assured:rest-assured:5.5.6")
    testImplementation("org.junit.jupiter:junit-jupiter:5.13.4")
    // Gradle 9 no longer adds the JUnit Platform launcher implicitly.
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.13.4")
}

kotlin {
    jvmToolchain(21)
}

tasks.test {
    useJUnitPlatform()
    // Backend under test. Start it first: ./gradlew :backend:quarkusDev
    systemProperty("e2e.base-url", findProperty("baseUrl")?.toString() ?: "http://localhost:4720")
}

// Explicit alias: ./gradlew :e2e:e2eTest (tests skip themselves if the backend is not running).
tasks.register("e2eTest") {
    group = "verification"
    description = "Run REST end-to-end tests against a running backend (default http://localhost:4720)"
    dependsOn("test")
}
