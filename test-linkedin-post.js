const axios = require('axios');

const ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const PERSON_URN = process.env.LINKEDIN_URN; // apna own profile/page URN

const postBody = {
  author: PERSON_URN,
  lifecycleState: "PUBLISHED",
  specificContent: {
    "com.linkedin.ugc.ShareContent": {
      shareCommentary: {
        text: "Testing mentions @[Person1](urn:li:member:1063059090) @[Person2](urn:li:member:110024875) @[Person3](urn:li:member:90120931) — exciting update! #automation #ai"
      },
      shareMediaCategory: "NONE"
    }
  },
  visibility: {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
  }
};

axios.post('https://api.linkedin.com/v2/ugcPosts', postBody, {
  headers: {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0'
  }
})
.then(res => console.log("✅ Posted:", res.data))
.catch(err => console.error("❌ Error:", err.response?.data || err.message));
