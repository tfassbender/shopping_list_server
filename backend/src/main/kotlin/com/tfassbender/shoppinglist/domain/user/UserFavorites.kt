package com.tfassbender.shoppinglist.domain.user

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog

/**
 * Personal favorites per shop layout (never shared). Stored as item names, matched case-insensitively –
 * "Milk" stays a favorite at that shop no matter on which list it appears.
 */
data class UserFavorites(
    val userId: UserId,
    val byLayout: Map<LayoutId, Set<String>> = emptyMap(),
) {
    fun favoritesOf(layoutId: LayoutId): Set<String> = byLayout[layoutId].orEmpty()

    fun isFavorite(layoutId: LayoutId, itemName: String): Boolean = SpaceCatalog.normalize(itemName) in favoritesOf(layoutId)

    fun add(layoutId: LayoutId, itemName: String): UserFavorites {
        val key = SpaceCatalog.normalize(itemName)
        if (key.isEmpty() || key.length > MAX_NAME_LENGTH) {
            throw DomainException(ErrorKind.VALIDATION, "INVALID_ITEM_NAME", "Invalid favorite name")
        }
        val current = favoritesOf(layoutId)
        if (key !in current && current.size >= MAX_PER_LAYOUT) {
            throw DomainException(ErrorKind.VALIDATION, "TOO_MANY_FAVORITES", "At most $MAX_PER_LAYOUT favorites per shop")
        }
        return copy(byLayout = byLayout + (layoutId to current + key))
    }

    fun remove(layoutId: LayoutId, itemName: String): UserFavorites {
        val remaining = favoritesOf(layoutId) - SpaceCatalog.normalize(itemName)
        return copy(byLayout = if (remaining.isEmpty()) byLayout - layoutId else byLayout + (layoutId to remaining))
    }

    companion object {
        const val MAX_NAME_LENGTH = 100
        const val MAX_PER_LAYOUT = 500
    }
}
