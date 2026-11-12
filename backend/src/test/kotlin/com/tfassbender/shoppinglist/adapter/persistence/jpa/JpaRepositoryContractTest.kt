package com.tfassbender.shoppinglist.adapter.persistence.jpa

import com.tfassbender.shoppinglist.adapter.persistence.RepositoryContract
import com.tfassbender.shoppinglist.application.port.ApiTokenRepository
import com.tfassbender.shoppinglist.application.port.CatalogRepository
import com.tfassbender.shoppinglist.application.port.LayoutRepository
import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.application.port.SyncStateRepository
import com.tfassbender.shoppinglist.application.port.UserRepository
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeEach

/**
 * [RepositoryContract] on PostgreSQL: the repositories are the CDI beans of the running app, backed by
 * the Dev Services database (needs Docker). Every call runs in its own transaction, as outside a lock.
 * Skipped when the tests run on the file storage (`-Pstorage=file`).
 */
@QuarkusTest
class JpaRepositoryContractTest : RepositoryContract() {

    @Inject override lateinit var users: UserRepository
    @Inject override lateinit var apiTokens: ApiTokenRepository
    @Inject override lateinit var spaces: SpaceRepository
    @Inject override lateinit var catalogs: CatalogRepository
    @Inject override lateinit var lists: ShoppingListRepository
    @Inject override lateinit var layouts: LayoutRepository
    @Inject override lateinit var sequence: SequenceCounter
    @Inject override lateinit var syncStates: SyncStateRepository

    @ConfigProperty(name = "shoppinglist.storage")
    lateinit var storage: String

    @BeforeEach
    fun requirePostgres() {
        // The injected beans are CDI proxies, so the storage is checked via the config, not the bean type.
        assumeTrue(storage == "postgres", "runs only with shoppinglist.storage=postgres")
    }
}
