import dotenv from "dotenv";
dotenv.config();
process.env.PROXY_HOST = "";
import { sendMessage } from "./linkedinEngine.js";
const result = await sendMessage("matt.smith", "https://www.linkedin.com/in/sunny-sidhu-vanhawke/", "Test message - ignore");
console.log(JSON.stringify(result));
