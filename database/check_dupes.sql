SELECT conversation_id, count(*) FROM evaluations GROUP BY conversation_id HAVING count(*) > 1;
