-- Order of the items within a category of a sorted list (issue #8): ADDED or ALPHABETICAL.
alter table users add column item_order varchar(16) not null default 'ADDED';
