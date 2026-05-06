SELECT 
  COUNT(*) as total_conversas,
  COUNT(campaign_id) as conversas_com_campanha_id
FROM conversations;
