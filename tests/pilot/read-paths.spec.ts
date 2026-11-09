import {test,expect} from "@playwright/test";
test("safe: login, dashboard, project diary, inspections and NCR",async({page})=>{
  test.setTimeout(90000);
  const project=process.env.SMOKE_PROJECT_ID!;
  if(!project || !process.env.SMOKE_PASSWORD)throw Error("A scoped pilot account and project are required");
  await page.goto("/login");await page.getByLabel("Empresa").fill(process.env.SMOKE_TENANT!);
  await page.getByLabel("E-mail",{exact:true}).fill(process.env.SMOKE_EMAIL!);
  await page.getByLabel("Password",{exact:true}).fill(process.env.SMOKE_PASSWORD!);
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible();
  for(const [route,label] of [["daily-logs",/diário/i],["inspections",/inspe/i],["non-conformities",/conformidade/i]] as const){
    const url="/projects/"+encodeURIComponent(project)+"/"+route;
    const response=await page.goto(url);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading",{name:label}).first()).toBeVisible();
  }
});
