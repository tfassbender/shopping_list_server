package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.adapter.persistence.jpa.JpaTransactionRunner
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
import jakarta.enterprise.inject.Produces
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
 */
@ApplicationScoped
class PersistenceProducers(
    @param:ConfigProperty(name = "shoppinglist.storage")
    storage: String,
    @param:ConfigProperty(name = "shoppinglist.data.dir")
    private val dataDir: String,
) {
    private val kind = StorageKind.of(storage)
    private val files by lazy { JsonFiles(Path.of(dataDir)) }

    @Produces
    @ApplicationScoped
    fun transactionRunner(): TransactionRunner = when (kind) {
        StorageKind.POSTGRES -> JpaTransactionRunner()
        StorageKind.FILE -> TransactionRunner.NONE
    }

    @Produces
    @ApplicationScoped
    fun userRepository(): UserRepository = FileUserRepository(files)

    @Produces
    @ApplicationScoped
    fun spaceRepository(): SpaceRepository = FileSpaceRepository(files)

    @Produces
    @ApplicationScoped
    fun shoppingListRepository(): ShoppingListRepository = FileShoppingListRepository(files)

    @Produces
    @ApplicationScoped
    fun sequenceCounter(): SequenceCounter = FileSequenceCounter(files)

    @Produces
    @ApplicationScoped
    fun catalogRepository(): CatalogRepository = FileCatalogRepository(files)

    @Produces
    @ApplicationScoped
    fun layoutRepository(): LayoutRepository = FileLayoutRepository(files)

    @Produces
    @ApplicationScoped
    fun apiTokenRepository(): ApiTokenRepository = FileApiTokenRepository(files)

    @Produces
    @ApplicationScoped
    fun syncStateRepository(): SyncStateRepository = FileSyncStateRepository(files)
}
