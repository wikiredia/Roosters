-- Test people (testdata.py) belong to the account that made them: only that account sees them in the debug list,
-- switches to them and back, and removes them. NULL for every real account.
ALTER TABLE users ADD COLUMN test_owner_id INT NULL;
ALTER TABLE users ADD KEY k_test_owner (test_owner_id)
