import {test,expect} from "@playwright/test";
test.use({javaScriptEnabled:false});
test("login forms cannot send credentials via the URL before hydration",async({page})=>{
  for(const route of ["/login","/platform/login","/reset-password"]){
    await page.goto(route);
    await expect(page.locator("form")).toHaveAttribute("method","post");
    await expect(page.locator("form button").first()).toBeDisabled();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  }
});
