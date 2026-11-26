-- Unit preselected for new items (issue #12); null: no unit.
alter table catalogs add column default_unit text;
