package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.application.port.UserRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.nio.file.Path

/**
 * Wires the file repositories as CDI beans. The repositories themselves are plain classes, so they can be
 * tested against a temp directory without Quarkus.
 */
@ApplicationScoped
class PersistenceProducers(
    @param:ConfigProperty(name = "shoppinglist.data.dir")
    private val dataDir: String,
) {
    private val files = JsonFiles(Path.of(dataDir))

    @Produces
    @ApplicationScoped
    fun userRepository(): UserRepository = FileUserRepository(files)
}
