// Interact with the production language menu, including collapsed mobile navigation.
async function chooseInterfaceLanguage(page, locale) {
  const trigger=page.locator('.language-trigger:visible').first();
  let navigation;
  if(!await trigger.count()) {
    const writing=page.locator('.writing-topbar-actions [data-slot=dropdown-menu-trigger]:visible').last();
    if(await writing.count()) {
      await writing.click();
      await page.getByRole('menuitem',{name:/^(Interface language|界面语言)$/,exact:true}).click();
    } else {
    navigation=page.locator('button[aria-controls="mobile-navigation"]:visible,button[aria-controls="admin-mobile-menu"]:visible').first();
    await navigation.click();
    }
  }
  if(await trigger.count()) await trigger.click();
  const names={en:/^English$/, 'zh-CN':/^(Chinese|中文)$/,system:/^(System|跟随系统)$/};
  await page.getByRole('menuitemradio',{name:names[locale]}).click();
  if(navigation && await navigation.getAttribute('aria-expanded')==='true') await navigation.click();
}
module.exports={chooseInterfaceLanguage};
