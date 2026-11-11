package com.tfassbender.shoppinglist.application.port

import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserFavorites
import com.tfassbender.shoppinglist.domain.user.UserId

interface LayoutRepository {
    fun findById(spaceId: SpaceId, layoutId: LayoutId): ShopLayout?
    fun findBySpace(spaceId: SpaceId): List<ShopLayout>
    fun save(layout: ShopLayout)
    fun delete(spaceId: SpaceId, layoutId: LayoutId)
}

interface FavoritesRepository {
    /** The user's favorites; empty if none were saved yet. */
    fun find(userId: UserId): UserFavorites
    fun save(favorites: UserFavorites)
}
