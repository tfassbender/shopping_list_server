package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import jakarta.ws.rs.NotFoundException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class RestExceptionMapperTest {

    private val mapper = RestExceptionMapper(includeStackTrace = false)

    @Test
    fun `domain exception maps kind to status and keeps the code`() {
        val response = mapper.toResponse(DomainException(ErrorKind.FORBIDDEN, "NOT_A_MEMBER", "no access"))

        assertEquals(403, response.status)
        assertEquals("NOT_A_MEMBER", (response.entity as ErrorResponse).code)
    }

    @Test
    fun `illegal argument maps to 400`() {
        val response = mapper.toResponse(IllegalArgumentException("bad"))

        assertEquals(400, response.status)
        assertEquals("INVALID_REQUEST", (response.entity as ErrorResponse).code)
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
