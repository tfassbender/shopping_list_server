plugins {
    kotlin("jvm")
    kotlin("plugin.allopen")
    // No-arg constructors for @Entity/@Embeddable classes (JPA instantiates them reflectively).
    kotlin("plugin.jpa")
    id("io.quarkus")
}

repositories {
    mavenCentral()
}

val quarkusPlatformVersion = providers.gradleProperty("quarkusPlatformVersion").get()

dependencies {
    implementation(enforcedPlatform("io.quarkus.platform:quarkus-bom:${quarkusPlatformVersion}"))
    implementation("io.quarkus:quarkus-rest-jackson")
    implementation("io.quarkus:quarkus-kotlin")
    implementation("io.quarkus:quarkus-arc")
    implementation("io.quarkus:quarkus-smallrye-openapi")
    implementation("io.quarkus:quarkus-smallrye-jwt")
    implementation("io.quarkus:quarkus-smallrye-jwt-build")
    implementation("io.quarkus:quarkus-mailer")
    // PostgreSQL persistence (shoppinglist.storage=postgres): plain JPA via Hibernate, schema owned by Flyway.
    implementation("io.quarkus:quarkus-hibernate-orm")
    implementation("io.quarkus:quarkus-jdbc-postgresql")
    implementation("io.quarkus:quarkus-flyway")
    implementation("io.quarkus:quarkus-flyway-postgresql")
    implementation("at.favre.lib:bcrypt:0.10.2")
    // Kotlin data classes (de)serialize without no-arg constructors; Quarkus auto-registers the module.
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-stdlib")

    testImplementation("io.quarkus:quarkus-junit5")
    testImplementation("io.rest-assured:rest-assured")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    // Enforces the hexagonal layering; runs as plain JUnit 5 (no @QuarkusTest).
    testImplementation("com.tngtech.archunit:archunit:1.4.1")
}

// Quarkus needs non-final CDI/REST beans and test classes; allopen avoids writing `open` everywhere.
allOpen {
    annotation("jakarta.ws.rs.Path")
    annotation("jakarta.enterprise.context.ApplicationScoped")
    annotation("jakarta.enterprise.context.RequestScoped")
    annotation("io.quarkus.test.junit.QuarkusTest")
    // Hibernate creates lazy-loading proxies as subclasses of entities.
    annotation("jakarta.persistence.Entity")
    annotation("jakarta.persistence.Embeddable")
}

kotlin {
    compilerOptions {
        // Emit parameter names (Quarkus/Jackson rely on them; Java analog: -parameters).
        javaParameters = true
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

tasks.withType<Test> {
    systemProperty("java.util.logging.manager", "org.jboss.logmanager.LogManager")
    // Tests run against Postgres (Dev Services, needs Docker); `-Pstorage=file` runs them on the file storage.
    providers.gradleProperty("storage").orNull?.let { systemProperty("shoppinglist.storage", it) }
}

// With -PwithFrontend the React SPA is built and packaged into META-INF/resources, where Quarkus serves
// it as static content. Without the flag (dev, plain tests) the backend builds standalone.
if (providers.gradleProperty("withFrontend").isPresent) {
    tasks.processResources {
        dependsOn(":frontend:npmBuild")
        from(rootProject.file("frontend/dist")) {
            into("META-INF/resources")
        }
    }
}
