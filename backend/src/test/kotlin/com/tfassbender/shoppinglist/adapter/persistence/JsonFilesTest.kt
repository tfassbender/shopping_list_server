package com.tfassbender.shoppinglist.adapter.persistence

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import java.io.UncheckedIOException
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.listDirectoryEntries
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class JsonFilesTest {

    @TempDir
    lateinit var dataDir: Path

    private val files by lazy { JsonFiles(dataDir) }

    data class Sample(val name: String, val count: Int = 0)

    @Test
    fun `reading a missing file gives null`() {
        assertNull(files.read(dataDir.resolve("nope.json"), Sample::class.java))
    }

    @Test
    fun `a corrupt file fails loudly instead of being treated as missing`() {
        // Returning null would let the next save overwrite the damaged data with an empty aggregate.
        val file = dataDir.resolve("broken.json")
        Files.writeString(file, "{ \"name\": ")

        val error = assertThrows<UncheckedIOException> { files.read(file, Sample::class.java) }
        assertTrue(error.message!!.contains("broken.json"))
    }

    @Test
    fun `write creates directories, replaces existing content and leaves no temp files`() {
        val file = dataDir.resolve("a/b/sample.json")
        files.write(file, Sample("first", 1))
        files.write(file, Sample("second", 2))

        assertEquals(Sample("second", 2), files.read(file, Sample::class.java))
        assertEquals(listOf("sample.json"), file.parent.listDirectoryEntries().map { it.name })
        assertTrue(file.readText().contains("\n")) // indented, so the data files stay readable for humans
    }

    @Test
    fun `listing a missing directory gives nothing`() {
        assertTrue(files.subdirectories(dataDir.resolve("missing")).isEmpty())
        assertTrue(files.jsonFiles(dataDir.resolve("missing")).isEmpty())
    }

    @Test
    fun `listing returns only directories or only json files`() {
        Files.createDirectories(dataDir.resolve("dir"))
        Files.writeString(dataDir.resolve("one.json"), "{}")
        Files.writeString(dataDir.resolve("notes.txt"), "x")

        assertEquals(listOf("dir"), files.subdirectories(dataDir).map { it.name })
        assertEquals(listOf("one.json"), files.jsonFiles(dataDir).map { it.name })
    }
}
