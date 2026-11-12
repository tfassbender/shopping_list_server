pluginManagement {
    val quarkusPluginVersion = providers.gradleProperty("quarkusPluginVersion").get()
    val kotlinVersion = providers.gradleProperty("kotlinVersion").get()
    repositories {
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        id("io.quarkus") version quarkusPluginVersion
        kotlin("jvm") version kotlinVersion
        kotlin("plugin.allopen") version kotlinVersion
        kotlin("plugin.jpa") version kotlinVersion
    }
}

rootProject.name = "shopping_list_server"

include("backend")
include("frontend")
include("e2e")
