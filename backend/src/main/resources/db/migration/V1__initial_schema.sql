-- Initial schema of the PostgreSQL storage (shoppinglist.storage=postgres).
--
-- One group of tables per aggregate (see doc/data_model.md). Rules:
-- * Foreign keys with ON DELETE CASCADE inside an aggregate and from all space data to `spaces` and all
--   personal data to `users`: deleting a space or a user removes everything that belongs to it.
-- * No foreign keys for id references the domain allows to dangle (category ids on items/layouts, list
--   ids on layouts, invite creator, stamp authors, member user ids).
-- * Ordered child collections carry a `position` column, so the domain lists round-trip in order.
-- * Ids are strings (server UUIDs or validated client ids up to 64 characters); lengths of free texts
--   are enforced by the domain, so they are plain `text` here.

-- ---------------------------------------------------------------------------------------------------
-- Users (personal)
-- ---------------------------------------------------------------------------------------------------

create table users (
    id                            varchar(64) primary key,
    email                         text        not null unique,
    display_name                  text        not null,
    password_hash                 text        not null,
    email_verified                boolean     not null,
    created_at                    timestamptz not null,
    language                      varchar(8)  not null,
    theme                         varchar(16) not null,
    checked_items_to_end          boolean     not null,
    ignore_merge_warnings         boolean     not null,
    session_version               integer     not null,
    email_verification_hash       text,
    email_verification_expires_at timestamptz,
    password_reset_hash           text,
    password_reset_expires_at     timestamptz
);
create index users_email_verification_hash_idx on users (email_verification_hash);
create index users_password_reset_hash_idx on users (password_reset_hash);

create table api_tokens (
    id           varchar(64) primary key,
    user_id      varchar(64) not null references users (id) on delete cascade,
    position     integer     not null,
    name         text        not null,
    scope        varchar(16) not null,
    hash         text        not null unique,
    created_at   timestamptz not null,
    expires_at   timestamptz,
    last_used_at timestamptz
);
create index api_tokens_user_idx on api_tokens (user_id);

-- ---------------------------------------------------------------------------------------------------
-- Spaces (shared): members and invites
-- ---------------------------------------------------------------------------------------------------

create table spaces (
    id         varchar(64) primary key,
    name       text        not null,
    created_at timestamptz not null
);

create table space_members (
    space_id  varchar(64) not null references spaces (id) on delete cascade,
    position  integer     not null,
    user_id   varchar(64) not null,
    role      varchar(16) not null,
    joined_at timestamptz not null,
    primary key (space_id, position)
);
create index space_members_user_idx on space_members (user_id);

create table space_invites (
    space_id   varchar(64) not null references spaces (id) on delete cascade,
    position   integer     not null,
    id         varchar(64) not null,
    token_hash text        not null,
    created_by varchar(64) not null,
    created_at timestamptz not null,
    expires_at timestamptz not null,
    primary key (space_id, position)
);
create index space_invites_token_hash_idx on space_invites (token_hash);

-- ---------------------------------------------------------------------------------------------------
-- Catalog (one per space): categories, units, item history
-- ---------------------------------------------------------------------------------------------------

create table catalogs (
    space_id varchar(64) primary key references spaces (id) on delete cascade,
    seq      bigint      not null
);

create table catalog_categories (
    space_id varchar(64) not null references catalogs (space_id) on delete cascade,
    position integer     not null,
    id       varchar(64) not null,
    name     text        not null,
    color    varchar(7)  not null,
    primary key (space_id, position)
);

create table catalog_units (
    space_id varchar(64) not null references catalogs (space_id) on delete cascade,
    position integer     not null,
    unit     text        not null,
    primary key (space_id, position)
);

create table item_history (
    space_id        varchar(64) not null references catalogs (space_id) on delete cascade,
    normalized_name text        not null,
    name            text        not null,
    category_id     varchar(64),
    unit            text,
    usage_count     integer     not null,
    last_used       timestamptz not null,
    seq             bigint      not null,
    primary key (space_id, normalized_name)
);

-- ---------------------------------------------------------------------------------------------------
-- Shopping lists and items
-- ---------------------------------------------------------------------------------------------------

create table shopping_lists (
    pk            bigint generated always as identity primary key,
    space_id      varchar(64) not null references spaces (id) on delete cascade,
    list_id       varchar(64) not null,
    name          text        not null,
    created_at    timestamptz not null,
    seq           bigint      not null,
    deleted       boolean     not null,
    deleted_at    timestamptz,
    name_stamp_seq bigint,
    name_stamp_by varchar(64),
    unique (space_id, list_id)
);

create table items (
    pk          bigint generated always as identity primary key,
    list_pk     bigint      not null references shopping_lists (pk) on delete cascade,
    position    integer     not null,
    item_id     varchar(64) not null,
    name        text        not null,
    quantity    text,
    unit        text,
    note        text,
    category_id varchar(64),
    checked     boolean     not null,
    deleted     boolean     not null,
    deleted_at  timestamptz,
    created_at  timestamptz not null,
    seq         bigint      not null,
    unique (list_pk, item_id)
);

-- Merge bookkeeping: who changed which aspect of an item last, at which seq.
create table item_stamps (
    item_pk bigint      not null references items (pk) on delete cascade,
    aspect  varchar(16) not null,
    seq     bigint      not null,
    by_user varchar(64),
    primary key (item_pk, aspect)
);

-- ---------------------------------------------------------------------------------------------------
-- Shop layouts
-- ---------------------------------------------------------------------------------------------------

create table shop_layouts (
    pk         bigint generated always as identity primary key,
    space_id   varchar(64) not null references spaces (id) on delete cascade,
    layout_id  varchar(64) not null,
    name       text        not null,
    mode       varchar(16) not null,
    created_at timestamptz not null,
    seq        bigint      not null,
    unique (space_id, layout_id)
);

create table layout_category_order (
    layout_pk   bigint      not null references shop_layouts (pk) on delete cascade,
    position    integer     not null,
    category_id varchar(64) not null,
    primary key (layout_pk, position)
);

create table layout_item_order (
    layout_pk bigint  not null references shop_layouts (pk) on delete cascade,
    position  integer not null,
    name      text    not null,
    primary key (layout_pk, position)
);

create table layout_lists (
    layout_pk bigint      not null references shop_layouts (pk) on delete cascade,
    list_id   varchar(64) not null,
    primary key (layout_pk, list_id)
);

-- ---------------------------------------------------------------------------------------------------
-- Sync bookkeeping per space
-- ---------------------------------------------------------------------------------------------------

create table space_sequences (
    space_id varchar(64) primary key references spaces (id) on delete cascade,
    value    bigint      not null
);

create table sync_states (
    space_id   varchar(64) primary key references spaces (id) on delete cascade,
    purged_seq bigint      not null
);

-- Processed client change ids (idempotency of sync batches).
create table sync_applied_changes (
    space_id   varchar(64) not null references sync_states (space_id) on delete cascade,
    change_id  text        not null,
    applied_at timestamptz not null,
    primary key (space_id, change_id)
);
