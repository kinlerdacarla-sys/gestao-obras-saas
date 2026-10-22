ALTER TABLE notifications ADD COLUMN message TEXT, ADD COLUMN entity_type TEXT, ADD COLUMN entity_id UUID, ADD COLUMN in_app_visible BOOLEAN NOT NULL DEFAULT true, ADD COLUMN emailed_at TIMESTAMPTZ(6);
CREATE INDEX notifications_email_pending ON notifications(created_at) WHERE emailed_at IS NULL;
