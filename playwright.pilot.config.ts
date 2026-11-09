import {defineConfig,devices} from "@playwright/test";
const url = new URL(process.env.PILOT_WEB_URL ?? "http://127.0.0.1:19000");
if(!["localhost","127.0.0.1"].includes(url.hostname) && (process.env.APP_ENV!=="staging" || process.env.AUTHORIZED_STAGING_HOST!==url.hostname || url.protocol!=="https:"))throw Error("Authorized staging host required");
export default defineConfig({testDir:"tests/pilot",workers:1,retries:0,use:{baseURL:url.origin},projects:[
 {name:"Chrome Android viewport",use:{...devices["Pixel 7"]}},
 {name:"iPhone WebKit viewport",use:{...devices["iPhone 13"]}},
 {name:"Desktop Firefox",use:{...devices["Desktop Firefox"]}},
 {name:"Desktop Edge",use:{...devices["Desktop Edge"],channel:"msedge"}}
]});
