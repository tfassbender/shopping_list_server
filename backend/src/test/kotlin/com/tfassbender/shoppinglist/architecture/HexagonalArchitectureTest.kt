package com.tfassbender.shoppinglist.architecture

import com.tngtech.archunit.core.domain.JavaClasses
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import com.tngtech.archunit.library.Architectures.layeredArchitecture
import org.junit.jupiter.api.Test

/**
 * Pins the hexagonal layering from `doc/tech_stack.md`: dependencies point inward
 * (adapter → application → domain) and the domain stays framework-free.
 * Plain JUnit 5 (no @QuarkusTest); checks production classes only.
 */
class HexagonalArchitectureTest {

    private val productionClasses: JavaClasses = ClassFileImporter()
        .withImportOption(ImportOption.DoNotIncludeTests())
        .importPackages(BASE_PACKAGE)

    @Test
    fun `layers depend only inward`() {
        layeredArchitecture().consideringOnlyDependenciesInLayers()
            .withOptionalLayers(true)
            .layer("Domain").definedBy("$BASE_PACKAGE.domain..")
            .layer("Application").definedBy("$BASE_PACKAGE.application..")
            .layer("Adapter").definedBy("$BASE_PACKAGE.adapter..")
            .whereLayer("Adapter").mayNotBeAccessedByAnyLayer()
            .whereLayer("Application").mayOnlyBeAccessedByLayers("Adapter")
            .whereLayer("Domain").mayOnlyBeAccessedByLayers("Application", "Adapter")
            .check(productionClasses)
    }

    @Test
    fun `domain is free of framework dependencies`() {
        noClasses().that().resideInAPackage("$BASE_PACKAGE.domain..")
            .should().dependOnClassesThat().resideInAnyPackage(
                "io.quarkus..",
                "io.vertx..",
                "jakarta..",
                "com.fasterxml..",
                "org.eclipse.microprofile..",
            )
            .because("the domain must stay pure Kotlin")
            .allowEmptyShould(true)
            .check(productionClasses)
    }

    @Test
    fun `application has no REST or JSON dependencies`() {
        noClasses().that().resideInAPackage("$BASE_PACKAGE.application..")
            .should().dependOnClassesThat().resideInAnyPackage("jakarta.ws.rs..", "com.fasterxml..", "io.vertx..")
            .because("HTTP and serialization belong to the adapters")
            .allowEmptyShould(true)
            .check(productionClasses)
    }

    @Test
    fun `JPA and transactions stay inside the persistence adapter`() {
        noClasses().that().resideOutsideOfPackage("$BASE_PACKAGE.adapter.persistence..")
            .should().dependOnClassesThat().resideInAnyPackage("jakarta.persistence..", "jakarta.transaction..", "io.quarkus.narayana..")
            .because("the storage technology is a detail of the persistence adapter")
            .check(productionClasses)
    }

    @Test
    fun `JPA entities are used only by the JPA repositories`() {
        // Entities are separate from the domain model (doc/tech_stack.md): they never leave the jpa package.
        noClasses().that().resideOutsideOfPackage("$BASE_PACKAGE.adapter.persistence.jpa..")
            .should().dependOnClassesThat().areAnnotatedWith("jakarta.persistence.Entity")
            .orShould().dependOnClassesThat().areAnnotatedWith("jakarta.persistence.Embeddable")
            .because("JPA entities are mapped to domain objects inside the JPA adapter")
            .check(productionClasses)
    }

    @Test
    fun `adapters do not depend on each other`() {
        ADAPTERS.forEach { adapter ->
            val others = ADAPTERS.filter { it != adapter }.map { "$BASE_PACKAGE.adapter.$it.." }
            noClasses().that().resideInAPackage("$BASE_PACKAGE.adapter.$adapter..")
                .should().dependOnClassesThat().resideInAnyPackage(*others.toTypedArray())
                .allowEmptyShould(true)
                .check(productionClasses)
        }
    }

    private companion object {
        const val BASE_PACKAGE = "com.tfassbender.shoppinglist"
        val ADAPTERS = listOf("rest", "persistence", "security", "email")
    }
}
