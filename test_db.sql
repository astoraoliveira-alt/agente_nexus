select trigger_name, event_object_table
from information_schema.triggers
where event_object_table = 'contacts';
