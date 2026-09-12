import sys

def patch_effect():
    file_path = "/Users/user/SaaS - Davos Nexus/agent-nexus-hub/src/pages/Campaigns.tsx"
    with open(file_path, "r") as f:
        content = f.read()

    # Find the useEffect block
    target = "if (agents.length === 1 && !newCampaign.agentId) {"
    replacement = "if (agents.length > 0 && !newCampaign.agentId) {"
    
    if target in content:
        content = content.replace(target, replacement)
        with open(file_path, "w") as f:
            f.write(content)
        print("Patched successfully")
    else:
        print("Target not found")

patch_effect()
