package com.tfassbender.shoppinglist.adapter.rest

import com.fasterxml.jackson.annotation.JsonInclude

/**
 * The JSON body of every error response. [errorId] is only set for unexpected (500) errors and refers to
 * the log entry; [stackTrace] is only included in dev mode.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class ErrorResponse(
    val code: String,
    val message: String?,
    val errorId: String? = null,
    val stackTrace: String? = null,
)
