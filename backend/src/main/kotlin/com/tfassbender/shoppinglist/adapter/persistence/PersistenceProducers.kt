package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaApiTokenRepository
import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaCatalogRepository
import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaLayoutRepository
import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaSequenceCounter
import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaShoppingListRepository
import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaSpaceRepository
import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaSyncStateRepository
import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaTransactionRunner
import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaUserRepository
import com.tfassbender.shoppinglist.application.port.ApiTokenRepository
import com.tfassbender.shoppinglist.application.port.CatalogRepository
import com.tfassbender.shoppinglist.application.port.LayoutRepository
import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.application.port.SyncStateRepository
import com.tfassbender.shoppinglist.application.port.TransactionRunner
import com.tfassbender.shoppinglist.application.port.UserRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Instance
import jakarta.enterprise.inject.Produces
import jakarta.persistence.EntityManager
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.nio.file.Path

/** The storage behind the repository ports, chosen by `shoppinglist.storage`. */
enum class StorageKind {
    POSTGRES,
    FILE;

    companion object {
        fun of(value: String): StorageKind = entries.firstOrNull { it.name.equals(value.trim(), ignoreCase = true) }
            ?: throw IllegalArgumentException("Unknown shoppinglist.storage '$value' (expected postgres or file)")
    }
}

/**
 * Wires the repositories of the configured storage as CDI beans. The repositories themselves are plain
 * classes, so the file ones can be tested against a temp directory without Quarkus.
 *
 * The entity manager is looked up lazily: in file mode Hibernate is inactive and must not be touched.
 */
@ApplicationScoped
class PersistenceProducers(
    @param:ConfigProperty(name = "shoppinglist.storage")
    storage: String,
    @param:ConfigProperty(name = "shoppinglist.data.dir")
    private val dataDir: String,
    private val entityManagers: Instance<EntityManager>,
) {
    private val kind = StorageKind.of(storage)
    private val files by lazy { JsonFiles(Path.of(dataDir)) }
    private val em: EntityManager by lazy { entityManagers.get() }

    private fun <T> pick(postgres: () -> T, file: () -> T): T = when (kind) {
        StorageKind.POSTGRES -> postgres()
        StorageKind.FILE -> file()
    }

    @Produces
    @ApplicationScoped
    fun transactionRunner(): TransactionRunner = pick({ JpaTransactionRunner() }, { TransactionRunner.NONE })

    @Produces
    @ApplicationScoped
    fun userRepository(): UserRepository = pick({ JpaUserRepository(em) }, { FileUserRepository(files) })

    @Produces
    @ApplicationScoped
    fun spaceRepository(): SpaceRepository = pick({ JpaSpaceRepository(em) }, { FileSpaceRepository(files) })

    @Produces
    @ApplicationScoped
    fun shoppingListRepository(): ShoppingListRepository =
        pick({ JpaShoppingListRepository(em) }, { FileShoppingListRepository(files) })

    @Produces
    @ApplicationScoped
    fun sequenceCounter(): SequenceCounter = pick({ JpaSequenceCounter(em) }, { FileSequenceCounter(files) })

    @Produces
    @ApplicationScoped
    fun catalogRepository(): CatalogRepository = pick({ JpaCatalogRepository(em) }, { FileCatalogRepository(files) })

    @Produces
    @ApplicationScoped
    fun layoutRepository(): LayoutRepository = pick({ JpaLayoutRepository(em) }, { FileLayoutRepository(files) })

    @Produces
    @ApplicationScoped
    fun apiTokenRepository(): ApiTokenRepository = pick({ JpaApiTokenRepository(em) }, { FileApiTokenRepository(files) })

    @Produces
    @ApplicationScoped
    fun syncStateRepository(): SyncStateRepository = pick({ JpaSyncStateRepository(em) }, { FileSyncStateRepository(files) })
}
