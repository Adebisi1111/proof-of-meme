# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *


class ProofOfMeme(gl.Contract):
    """Viral meme bounty escrow with AI verification."""
    
    bounties: TreeMap[u256, str]  # bounty_id -> JSON
    next_bounty_id: u256 = u256(0)
    
    def __init__(self):
        pass
    
    @gl.public.write.payable
    def create_bounty(self, project_token: str, description: str, min_engagement: int) -> u256:
        """Create a meme bounty. Caller sends GEN as reward."""
        bounty_id = self.next_bounty_id
        self.next_bounty_id += u256(1)
        self.bounties[bounty_id] = json.dumps({
            "project_token": project_token,
            "description": description,
            "min_engagement": int(min_engagement),
            "creator": gl.message.sender_address.as_hex,
            "amount": int(gl.message.value),
            "status": "OPEN",
            "submissions": []
        })
        return bounty_id
    
    @gl.public.write
    def submit_meme(self, bounty_id: u256, post_url: str):
        """Submit a meme post URL for verification."""
        bounty = json.loads(self.bounties.get(bounty_id, "{}"))
        if not bounty:
            raise gl.vm.UserError("Bounty not found")
        if bounty["status"] != "OPEN":
            raise gl.vm.UserError("Bounty not open")
        
        # AI verification using comparative consensus
        def verify_meme() -> dict:
            prompt = (
                f"Check this URL: {post_url}\n"
                f"Project: {bounty['project_token']}\n"
                f"Task: Verify this is a viral meme post about {bounty['project_token']}.\n"
                f"Check: 1) Is it a meme/image post? 2) Is it about {bounty['project_token']}? "
                f"3) Does it have significant engagement (likes, shares, comments)?\n"
                f"Respond as JSON: {{\"is_meme\": true/false, \"is_about_project\": true/false, "
                f"\"has_engagement\": true/false, \"reasoning\": \"brief explanation\"}}"
            )
            res = gl.nondet.exec_prompt(prompt, response_format="json")
            return {
                "is_meme": bool(res.get("is_meme", False)),
                "is_about_project": bool(res.get("is_about_project", False)),
                "has_engagement": bool(res.get("has_engagement", False)),
                "reasoning": str(res.get("reasoning", ""))
            }
        
        principle = (
            "The post must be a meme about the specified project with significant engagement. "
            "All validators must agree it qualifies as a viral meme post."
        )
        
        try:
            result = gl.eq_principle.prompt_comparative(verify_meme, principle)
            approved = result["is_meme"] and result["is_about_project"] and result["has_engagement"]
        except gl.vm.UserError:
            approved = False
            result = {"is_meme": False, "is_about_project": False, "has_engagement": False, "reasoning": "Consensus failed"}
        
        submissions = bounty.get("submissions", [])
        submissions.append({
            "submitter": gl.message.sender_address.as_hex,
            "url": post_url,
            "approved": approved,
            "reasoning": result["reasoning"]
        })
        bounty["submissions"] = submissions
        
        if approved:
            bounty["status"] = "COMPLETED"
            bounty["winner"] = gl.message.sender_address.as_hex
        
        self.bounties[bounty_id] = json.dumps(bounty)
        return "APPROVED" if approved else "REJECTED"
    
    @gl.public.view
    def get_bounty(self, bounty_id: u256) -> str:
        bounty = self.bounties.get(bounty_id, None)
        if bounty is None:
            return json.dumps({"error": "not found"})
        return bounty
    
    @gl.public.view
    def get_all_bounties(self) -> str:
        """Return all bounties as JSON list."""
        result = []
        for i in range(int(self.next_bounty_id)):
            bounty = self.bounties.get(u256(i), None)
            if bounty is not None:
                parsed = json.loads(bounty)
                parsed["id"] = i
                result.append(parsed)
        return json.dumps(result)


import json
