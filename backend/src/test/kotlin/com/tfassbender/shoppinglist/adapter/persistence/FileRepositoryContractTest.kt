package com.tfassbender.shoppinglist.adapter.persistence

import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path

/** [RepositoryContract] on the JSON file storage - plain JUnit against a temp directory. */
class FileRepositoryContractTest : RepositoryContract() {

    @TempDir
    lateinit var dataDir: Path

    private val files by lazy { JsonFiles(dataDir) }

    override val users by lazy { FileUserRepository(files) }
    override val apiTokens by lazy { FileApiTokenRepository(files) }
    override val spaces by lazy { FileSpaceRepository(files) }
    override val catalogs by lazy { FileCatalogRepository(files) }
    override val lists by lazy { FileShoppingListRepository(files) }
    override val layouts by lazy { FileLayoutRepository(files) }
    override val sequence by lazy { FileSequenceCounter(files) }
    override val syncStates by lazy { FileSyncStateRepository(files) }
}
