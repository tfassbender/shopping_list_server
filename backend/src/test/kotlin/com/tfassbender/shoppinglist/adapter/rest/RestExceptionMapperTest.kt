package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import jakarta.ws.rs.NotFoundException
import jakarta.ws.rs.WebApplicationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource

class RestExceptionMapperTest {

    private val mapper = RestExceptionMapper(includeStackTrace = false)

    @Test
    fun `domain exception maps kind to status and keeps the code`() {
        val response = mapper.toResponse(DomainException(ErrorKind.FORBIDDEN, "NOT_A_MEMBER", "no access"))

        assertEquals(403, response.status)
        assertEquals("NOT_A_MEMBER", (response.entity as ErrorResponse).code)
    }

    @ParameterizedTest
    @CsvSource("VALIDATION,400", "UNAUTHORIZED,401", "FORBIDDEN,403", "NOT_FOUND,404", "CONFLICT,409", "UNAVAILABLE,503")
    fun `every error kind has its status`(kind: ErrorKind, status: Int) {
        val response = mapper.toResponse(DomainException(kind, "SOME_CODE", "msg"))

        assertEquals(status, response.status)
        assertEquals(ErrorResponse("SOME_CODE", "msg"), response.entity)
    }

    @Test
    fun `framework exception with a non-standard status gets a generic code`() {
        val response = mapper.toResponse(WebApplicationException(499))

        assertEquals(499, response.status)
        assertEquals("HTTP_499", (response.entity as ErrorResponse).code)
    }

    @Test
    fun `unexpected exception includes details in dev mode`() {
        val body = RestExceptionMapper(includeStackTrace = true).toResponse(IllegalStateException("secret detail")).entity as ErrorResponse

        assertEquals("INTERNAL_ERROR", body.code)
        assertTrue(body.message!!.contains("secret detail"))
        assertTrue(body.stackTrace!!.contains("IllegalStateException"))
    }

    @Test
    fun `illegal argument is a server bug, not a client error`() {
        val response = mapper.toResponse(IllegalArgumentException("A space needs exactly one owner"))

        assertEquals(500, response.status)
        assertEquals("INTERNAL_ERROR", (response.entity as ErrorResponse).code)
    }

    @Test
    fun `framework exception keeps its status`() {
        val response = mapper.toResponse(NotFoundException())

        assertEquals(404, response.status)
        assertEquals("NOT_FOUND", (response.entity as ErrorResponse).code)
    }

    @Test
    fun `unexpected exception hides details outside dev mode`() {
        val body = mapper.toResponse(IllegalStateException("secret detail")).entity as ErrorResponse

        assertEquals("INTERNAL_ERROR", body.code)
        assertNotNull(body.errorId)
        assertNull(body.stackTrace)
        assertEquals(false, body.message!!.contains("secret detail"))
    }
}
