const {renderBrandedEmail}=require('./mailTemplate');
const {message}=require('./serverMessages');
function subscriptionConfirmation(url,unsubscribe,locale='zh-CN'){
 const t=key=>message(key,locale),actions=unsubscribe?[{label:t('unsubscribeAnonymous'),url:unsubscribe}]:[];
 return {text:[t('confirmTitle'),t('confirmBody'),t('confirmExpiry'),t('confirmAction')+': '+url,...actions.map(a=>a.label+': '+a.url)].join('\n\n'),html:renderBrandedEmail({locale,eyebrow:t('subscription'),title:t('confirmTitle'),intro:t('confirmIntro'),paragraphs:[t('confirmBody'),t('confirmExpiry')],cta:{label:t('confirmAction'),url},actions,footer:t('subscriptionFooter')})};
}
function newsletterMessage(items,origin,unsubscribe,locale='zh-CN'){
 const t=key=>message(key,locale);
 const sections=[['post','posts','readPost'],['update','updates','readUpdate'],['release','releases','readRelease']].map(([type,label,action])=>({label:t(label),items:items.filter(i=>i.type===type).map(i=>({...i,actionLabel:t(action),url:origin+i.path}))})).filter(group=>group.items.length);
 return {text:[t('weeklyTitle'),...sections.flatMap(group=>[group.label,...group.items.map(i=>`${i.title}\n${i.excerpt}\n${i.actionLabel}: ${i.url}`)]),t('weeklyFooter'),t('unsubscribe')+': '+unsubscribe].join('\n\n'),html:renderBrandedEmail({locale,eyebrow:t('newsletter'),title:t('weeklyTitle'),intro:t('weeklyIntro'),sections,actions:[{label:t('unsubscribe'),url:unsubscribe}],footer:t('weeklyFooter')})};
}
module.exports={subscriptionConfirmation,newsletterMessage};
