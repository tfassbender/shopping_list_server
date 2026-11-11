package com.tfassbender.shoppinglist.adapter.persistence

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.io.IOException
import java.io.UncheckedIOException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import kotlin.io.path.exists
import kotlin.io.path.isDirectory
import kotlin.io.path.listDirectoryEntries
import kotlin.io.path.name
import kotlin.io.path.readText

/**
 * Low-level file access shared by all file repositories: one JSON file per aggregate, written atomically
 * (temp file in the same directory + atomic move), so a crash never leaves a half-written file.
 * Owns its own [ObjectMapper] – persistence DTOs are independent of the REST JSON settings.
 */
class JsonFiles(val root: Path) {

    val mapper: ObjectMapper = jacksonObjectMapper()
        .registerModule(JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        .enable(SerializationFeature.INDENT_OUTPUT)
        // Older/newer files may carry fields this version doesn't know - don't fail on them.
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)

    fun usersDir(): Path = root.resolve("users")
    fun userDir(id: String): Path = usersDir().resolve(safeSegment(id))
    fun spacesDir(): Path = root.resolve("spaces")
    fun spaceDir(id: String): Path = spacesDir().resolve(safeSegment(id))

    fun <T> read(file: Path, type: Class<T>): T? {
        if (!file.exists()) return null
        return try {
            mapper.readValue(file.readText(), type)
        } catch (e: IOException) {
            throw UncheckedIOException("Failed to read '$file'", e)
        }
    }

    fun write(file: Path, value: Any) {
        val dir = file.parent
        Files.createDirectories(dir)
        val tmp = Files.createTempFile(dir, "${file.name}.", ".tmp")
        try {
            Files.writeString(tmp, mapper.writeValueAsString(value))
            move(tmp, file)
        } catch (e: IOException) {
            Files.deleteIfExists(tmp)
            throw UncheckedIOException("Failed to write '$file'", e)
        }
    }

    fun subdirectories(dir: Path): List<Path> =
        if (dir.isDirectory()) dir.listDirectoryEntries().filter { it.isDirectory() } else emptyList()

    fun jsonFiles(dir: Path): List<Path> =
        if (dir.isDirectory()) dir.listDirectoryEntries("*.json") else emptyList()

    fun deleteRecursively(path: Path) {
        if (path.exists()) {
            path.toFile().deleteRecursively()
        }
    }

    private fun move(tmp: Path, target: Path) {
        try {
            Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING)
        }
    }

    companion object {
        private val SAFE_SEGMENT = Regex("^[A-Za-z0-9_-]{1,64}$")

        /** Guards ids used as path segments, so a crafted id can't escape the data directory. */
        fun safeSegment(id: String): String {
            require(SAFE_SEGMENT.matches(id)) { "Invalid id: '$id'" }
            return id
        }
    }
}
