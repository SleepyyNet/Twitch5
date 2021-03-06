﻿
'use strict';

const ЛЕВАЯ_КНОПКА                        = 0;
const СРЕДНЯЯ_КНОПКА                      = 1;
const ПРАВАЯ_КНОПКА                       = 2;

const СТРАНИЦА_НЕИЗВЕСТНАЯ                = 0;
const СТРАНИЦА_ВОЗМОЖНО_ПРЯМАЯ_ТРАНСЛЯЦИЯ = 1;
const СТРАНИЦА_ЧАТ_КАНАЛА                 = 2;

// См. ПолучитьАдресКанала() в player.js.
const АДРЕС_НЕ_ПЕРЕНАПРАВЛЯТЬ = 'twitch5=0';

const ЭТО_НЕ_КОД_КАНАЛА =
[
	'directory',
	'friends',
	'subscriptions',
	'inventory',
	'manager',
	'signup',
	'login',
	'logout',
	'embed'
];

const ХРАНИТЬ_СОСТОЯНИЕ_КАНАЛА = 20000; // Миллисекунды.


let г_оРазобранныйАдрес;
let г_сИсторияВкладки;

let г_оЗапрос = null;
let г_сКодКанала = '';
//  0 - состояние не получено.
// -1 - после завершения г_оЗапрос не перенаправлять.
// -2 - после завершения г_оЗапрос перенаправить на канал г_сКодКанала.
let г_чПоследняяПроверка = 0;
let г_лИдетТрансляция = false; // Состояние канала.

const Журнал = () => {};

const м_Настройки = (() =>
{
	let _пАвтоперенаправлениеВключено;
	
	function АвтоперенаправлениеВключено()
	// null  - включено, показать справку.
	// true  - включено.
	// false - отключено.
	{
		if (_пАвтоперенаправлениеВключено === undefined)
		{
			const п = localStorage.getItem('Twitch5Перенаправлять');
			_пАвтоперенаправлениеВключено = п === null ? null : п !== 'false';
		}
		return _пАвтоперенаправлениеВключено;
	}

	function ВключитьАвтоперенаправление(лВключить)
	{
		_пАвтоперенаправлениеВключено = лВключить;
		localStorage.setItem('Twitch5Перенаправлять', лВключить);
	}

	return {АвтоперенаправлениеВключено, ВключитьАвтоперенаправление};
})();

function GetMessage(sMessageName)
{
	if (typeof sMessageName === 'string')
	{
		const sMessageText = chrome.i18n.getMessage(sMessageName);
		if (sMessageText)
		{
			return sMessageText;
		}
	}
	throw new Error(`[Twitch 5] Не найден текст ${sMessageName}`);
}

function ПолучитьСсылкуВКоторойНаходится(узУзел)
{
	for (; узУзел; узУзел = узУзел.parentElement)
	{
		if (узУзел.nodeName === 'A')
		{
			return узУзел;
		}
	}
	return null;
}

function ВставитьНаСтраницу(фВставить)
{
	const узСкрипт = document.createElement('script');
	узСкрипт.textContent =
	`
		'use strict';
		(${фВставить})();
	`;
	(document.head || document.documentElement).appendChild(узСкрипт);
	// Если <head> в этот момент недоступен, то наш <script> нужно сразу удалить, иначе
	// часть <script> (в основном реклама) позже будет вставлена в <html> вместо
	// <head> кодом getElementsByTagName('script')[0].parentNode.appendChild(script).
	// Удаление будет полезно и в других случаях.
	узСкрипт.remove();
}

function ЭтотАдресМожноПеренаправлять(oUrl)
{
	return oUrl.search.indexOf(АДРЕС_НЕ_ПЕРЕНАПРАВЛЯТЬ) === -1;
}

function ПолучитьНеперенаправляемыйАдрес(oUrl)
{
	return `${oUrl.protocol}//${oUrl.host}${oUrl.pathname}`
		+ (oUrl.search.length > 1 ? `${oUrl.search}&${АДРЕС_НЕ_ПЕРЕНАПРАВЛЯТЬ}` : `?${АДРЕС_НЕ_ПЕРЕНАПРАВЛЯТЬ}`)
		+ oUrl.hash;
}

function ЗапретитьАвтоперенаправлениеЭтойСтраницы()
// Чтобы можно было вернуться на страницу нажав кнопку браузера Назад.
{
	if (ЭтотАдресМожноПеренаправлять(location))
	{
		history.replaceState(history.state, '', ПолучитьНеперенаправляемыйАдрес(location));
	}
}

function РазобратьАдрес(oUrl)
// У Twitch упоротая система адресов. Например /directory - это список игр, /derectory - канал.
// У многих страниц канала исходный код совпадает.
// Сервер Twitch перенаправляет с twitch.tv на www.twitch.tv.
// Сервер Twitch перенаправляет на адрес с первой директорией в нижнем регистре.
// Сервер Twitch иногда переводит параметры в нижний регистр.
{
	let чСтраница = СТРАНИЦА_НЕИЗВЕСТНАЯ;
	let сКодКанала = '';
	let лМожноПеренаправлять = false;
	if (oUrl.protocol === 'https:' && (oUrl.host === 'www.twitch.tv' || oUrl.host === 'm.twitch.tv'))
	{
		const мсЧасти = oUrl.pathname.match(/^\/([^/]+)(\/[^/]+)?(\/[^/]+)?\/?$/);
		if (мсЧасти && мсЧасти[2] === undefined)
		{
			// Оптимизация. Не слать напрасно запрос.
			if (ЭТО_НЕ_КОД_КАНАЛА.indexOf(мсЧасти[1]) === -1)
			{
				чСтраница = СТРАНИЦА_ВОЗМОЖНО_ПРЯМАЯ_ТРАНСЛЯЦИЯ;
				сКодКанала = мсЧасти[1];
				лМожноПеренаправлять = ЭтотАдресМожноПеренаправлять(oUrl);
			}
		}
		else if (мсЧасти && (мсЧасти[1] === 'embed' || мсЧасти[1] === 'popout') && мсЧасти[3] === '/chat')
		{
			чСтраница = СТРАНИЦА_ЧАТ_КАНАЛА;
			сКодКанала = мсЧасти[2].slice(1);
		}
	}
	Журнал('[Twitch 5] Адрес разобран: Страница=%s КодКанала=%s МожноПеренаправлять=%s', чСтраница, сКодКанала, лМожноПеренаправлять);
	this.чСтраница = чСтраница;
	this.сКодКанала = сКодКанала;
	this.лМожноПеренаправлять = лМожноПеренаправлять;
}

function ПолучитьАдресНашегоПроигрывателя(сКодКанала)
{
	return `${chrome.extension.getURL('player.html')}?channel=${сКодКанала}`;
}

function ЗапроситьСостояниеКанала(оРазобранныйАдрес)
{
	// Адрес перенаправлять не нужно?
	if (!оРазобранныйАдрес.лМожноПеренаправлять || м_Настройки.АвтоперенаправлениеВключено() === false)
	{
		return;
	}
	// Ответ уже получен?
	if (!г_оЗапрос && г_сКодКанала === оРазобранныйАдрес.сКодКанала && performance.now() - г_чПоследняяПроверка < ХРАНИТЬ_СОСТОЯНИЕ_КАНАЛА)
	{
		return;
	}
	// Запрос уже отправлен?
	if (г_оЗапрос && г_сКодКанала === оРазобранныйАдрес.сКодКанала)
	{
		return;
	}
	ОтменитьЗапрос();
	г_сКодКанала = оРазобранныйАдрес.сКодКанала;
	г_чПоследняяПроверка = -1;
	ОтправитьЗапрос();
}

function ИзмененАдресСтраницы(сИсторияВкладки)
{
	г_оРазобранныйАдрес = new РазобратьАдрес(location);
	г_сИсторияВкладки = сИсторияВкладки;
	// Адрес перенаправлять не нужно?
	if (!г_оРазобранныйАдрес.лМожноПеренаправлять || м_Настройки.АвтоперенаправлениеВключено() === false)
	{
		if (г_чПоследняяПроверка === -2)
		{
			г_чПоследняяПроверка = -1;
		}
		return false;
	}
	// Ответ уже получен?
	if (!г_оЗапрос && г_сКодКанала === г_оРазобранныйАдрес.сКодКанала && performance.now() - г_чПоследняяПроверка < ХРАНИТЬ_СОСТОЯНИЕ_КАНАЛА)
	{
		if (г_лИдетТрансляция)
		{
			ПеренаправитьНаНашПроигрыватель(г_сКодКанала);
			return true;
		}
		return false;
	}
	// Запрос уже отправлен?
	if (г_оЗапрос && г_сКодКанала === г_оРазобранныйАдрес.сКодКанала)
	{
		г_чПоследняяПроверка = -2;
		return false;
	}
	ОтменитьЗапрос();
	г_сКодКанала = г_оРазобранныйАдрес.сКодКанала;
	г_чПоследняяПроверка = -2;
	ОтправитьЗапрос();
	return false;
}

function ОтменитьЗапрос()
{
	if (г_оЗапрос)
	{
		Журнал('[Twitch 5] Отменяю незавершенный запрос');
		// Синхронно вызывает обработчик события loadend, который изменяет состояние канала.
		г_оЗапрос.abort();
	}
}

function ОтправитьЗапрос()
{
	const сАдресЗапроса = `https://api.twitch.tv/kraken/streams/${г_сКодКанала}`;
	Журнал('[Twitch 5] Посылаю запрос', сАдресЗапроса);
	г_оЗапрос = new XMLHttpRequest();
	г_оЗапрос.addEventListener('loadend', ОбработатьОтвет);
	г_оЗапрос.open('GET', сАдресЗапроса);
	г_оЗапрос.responseType = 'text';
	г_оЗапрос.timeout = 10000;
	г_оЗапрос.setRequestHeader('Client-ID', 'jzkbprff40iqj646a697cyrvl0zt2m6');
	// Версия 3, чтобы не делать лишнего запроса на получение идентификатора канала.
	г_оЗапрос.setRequestHeader('Accept', 'application/vnd.twitchtv.v3+json');
	г_оЗапрос.send();
}

function ОбработатьОтвет()
{
	Журнал('[Twitch 5] Получен ответ Код=%s\n%s', this.status, this.response);
	г_оЗапрос = null;
	// Вызван abort(), проблемы на сервере, неправильно составлен запрос, указанного канала не существует...
	if (this.status !== 200 || !this.response)
	{
		г_чПоследняяПроверка = 0;
		return;
	}
	const лПеренаправить = г_чПоследняяПроверка === -2;
	г_чПоследняяПроверка = performance.now();
	г_лИдетТрансляция = false;
	try
	{
		г_лИдетТрансляция = typeof JSON.parse(this.response).stream._id === 'number';
	}
	catch (и)
	{
		// Вместо JSON прислали фигню, трансляция завершена, указанного канала не существует...
	}
	if (лПеренаправить && г_лИдетТрансляция)
	{
		ПеренаправитьНаНашПроигрыватель(г_сКодКанала);
	}
}

function ЗапуститьНашПроигрыватель(сКодКанала)
{
	const сАдресПроигрывателя = ПолучитьАдресНашегоПроигрывателя(сКодКанала);
	Журнал('[Twitch 5] Перехожу на страницу', сАдресПроигрывателя);
	ЗапретитьАвтоперенаправлениеЭтойСтраницы();
	location.assign(сАдресПроигрывателя);
}

function ПеренаправитьНаНашПроигрыватель(сКодКанала)
{
	const сАдресПроигрывателя = ПолучитьАдресНашегоПроигрывателя(сКодКанала);
	Журнал('[Twitch 5] Меняю адрес страницы с %s на %s', location.href, сАдресПроигрывателя);
	document.documentElement.setAttribute('data-tw5-перенаправление', '');
	//
	// HACK Opera 52: location.replace(chrome-extension://) не замещает, а добавляет адрес в историю.
	//
	if (!navigator.userAgent.includes('OPR/'))
	{
		location.replace(сАдресПроигрывателя);
	}
	else if (г_сИсторияВкладки === 'добавление')
	{
		// Может синхронно вызвать обработчик события popstate.
		history.back();
		document.title = 'Twitch';
		location.assign(сАдресПроигрывателя);
	}
	else
	{
		ЗапретитьАвтоперенаправлениеЭтойСтраницы();
		// Между сменой адреса и сменой заголовка может пройти несколько секунд. Если перенаправить до смены заголовка,
		// то в истории будет заголовок предыдущей страницы. Лучше урезаный заголовок, чем неправильный.
		if (г_сИсторияВкладки !== 'загрузка')
		{
			document.title = 'Twitch';
		}
		location.assign(сАдресПроигрывателя);
	}
}

function ОбработатьЩелчокМыши(оСобытие)
// У адреса ссылки и адреса страницы могут отличаться pathname и search. Например:
// https://www.twitch.tv/channel/videos?tt_medium=twitch_topnav&tt_content=tab_videos
// https://www.twitch.tv/channel/videos/all
{
	const узСсылка = ПолучитьСсылкуВКоторойНаходится(оСобытие.target);
	// Ссылка откроется в той же вкладке?
	if (узСсылка && узСсылка.href && оСобытие.button === ЛЕВАЯ_КНОПКА && !оСобытие.shiftKey && !оСобытие.ctrlKey && !оСобытие.altKey && !оСобытие.metaKey)
	{
		Журнал('[Twitch 5] Вызван обработчик %s ссылки %s', оСобытие.type, узСсылка.href);
		// Шлем запрос заранее. Это сэкономит до 200 мс.
		ЗапроситьСостояниеКанала(new РазобратьАдрес(узСсылка));
	}
}

function ОбработатьPopState(оСобытие)
// В истории неперенаправленные адреса могут появиться если:
// 1. Расширение было отключено.
// 2. Автоперенаправление было отключено.
// 3. Был сделан переход на другую страницу до получения ответа.
{
	Журнал('[Twitch 5] Совершен переход по истории на адрес', location.href);
	ОбработатьPopState.лОбработчикВызван = true;
	// Вызван history.back() в ПеренаправитьНаНашПроигрыватель()?
	if (document.documentElement.hasAttribute('data-tw5-перенаправление') || ИзмененАдресСтраницы('переход'))
	{
		оСобытие.stopImmediatePropagation();
		оСобытие.stopPropagation();
	}
}

function ОбработатьPushState()
{
	Журнал('[Twitch 5] В историю добавлен адрес', location.href);
	ИзмененАдресСтраницы('добавление');
}

function ОбработатьЗапускНашегоПроигрывателя(оСобытие)
{
	оСобытие.preventDefault();
	if (оСобытие.button === ЛЕВАЯ_КНОПКА && г_оРазобранныйАдрес.чСтраница === СТРАНИЦА_ВОЗМОЖНО_ПРЯМАЯ_ТРАНСЛЯЦИЯ)
	{
		ЗапуститьНашПроигрыватель(г_оРазобранныйАдрес.сКодКанала);
	}
	else
	{
		Журнал(`[Twitch 5] Кнопка=${оСобытие.button} Страница=${г_оРазобранныйАдрес.чСтраница}`);
	}
}

function ОбработатьПереключениеАвтоперенаправления(оСобытие)
{
	оСобытие.preventDefault();
	// Первое переключение отключает справку, оставляя автоперенаправление включенным.
	const лВключить = м_Настройки.АвтоперенаправлениеВключено() !== true;
	Журнал('[Twitch 5] Автоперенаправление:', лВключить);
	м_Настройки.ВключитьАвтоперенаправление(лВключить);
	ОбновитьНашуКнопку();
}

function ОбработатьЗакрытиеСправки(оСобытие)
{
	оСобытие.stopPropagation();
	оСобытие.currentTarget.classList.remove('tw5-справка');
	оСобытие.currentTarget.removeEventListener('click', ОбработатьЗакрытиеСправки, true);
	оСобытие.currentTarget.removeEventListener('contextmenu', ОбработатьЗакрытиеСправки, true);
	ОбработатьПереключениеАвтоперенаправления(оСобытие);
}

function ОбновитьНашуКнопку()
{
	const узКнопка = document.getElementsByClassName('tw5-автоперенаправление')[0];
	const лВключена = м_Настройки.АвтоперенаправлениеВключено() !== false;
	узКнопка.classList.toggle('tw5-включено', лВключена);
	узКнопка.classList.toggle('tw5-отключено', !лВключена);
}

function ВставитьНашуКнопку()
// Разметка максимально близка к обычным кнопкам, чтобы улучшить совместимомть с другими расширениями, которые изменяют Twitch.tv.
{
	let узКудаВставлять = document.getElementsByClassName('mw-top-nav__menu')[0];
	if (узКудаВставлять)
	{
		Журнал('[Twitch 5] Вставляю нашу кнопку для мобильного сайта');
		узКудаВставлять.insertAdjacentHTML('beforebegin',
		`
		<div class="tw5-автоперенаправление mw-top-nav__menu tw-tooltip-wrapper">
			<button id="tw5-автоперенаправление" class="tw-button-icon tw-button-icon--overlay tw-button-icon--large">
				<span class="tw-button-icon__icon">
					<figure class="tw-svg">
						<svg class="tw-svg__asset tw-svg__asset--more tw-svg__asset--inherit" viewBox="-4 -4 26 26" xmlns="http://www.w3.org/2000/svg">
							<path fill-opacity="0.85" d="M1.145 0.001h7.975v3.176h-4.49l0.294 3.253h4.198v3.168h-7.106zM2.152 11.193h3.189l0.224 2.54 3.553 0.951v3.316l-6.52-1.819z"/>
							<path d="M16.855 0.001h-7.96v3.176h7.666zM16.275 6.429h-7.379v3.176h3.917l-0.37 4.128-3.547 0.951v3.301l6.505-1.804z"/>
						</svg>
					</figure>
				</span>
			</button>
			<div class="tw5-многостроч tw-tooltip tw-tooltip--down tw-tooltip--align-right">
				${GetMessage('F0600')}
			</div>
			<style>
				.tw5-многостроч
				{
					line-height: 1.4 !important;
				}
				.tw5-автоперенаправление.tw5-отключено svg
				{
					opacity: .4;
				}
				.tw5-справка > .tw-tooltip
				{
					display: block !important;
					color: white !important;
					background: #f00000 !important;
					pointer-events: auto !important;
					cursor: pointer !important;
				}
				.tw5-справка > .tw-tooltip::after
				{
					background: #f00000 !important;
				}
			</style>
		</div>
		`);
	}
	else
	{
		узКудаВставлять = document.getElementsByClassName('top-nav__menu')[0];
		if (!узКудаВставлять || узКудаВставлять.nodeName !== 'DIV')
		{
			return false;
		}
		Журнал('[Twitch 5] Вставляю нашу кнопку для нового сайта');
		узКудаВставлять.lastElementChild.insertAdjacentHTML('beforebegin',
		`
		<div class="tw5-автоперенаправление tw-align-self-center tw-flex-grow-0 tw-flex-shrink-0 tw-flex-nowrap tw-pd-l-05 tw-pd-r-1">
			<div class="tw-inline-flex tw-tooltip-wrapper">
				<button id="tw5-автоперенаправление" class="tw-button-icon tw-button-icon--overlay tw-button-icon--large">
					<span class="tw-button-icon__icon">
						<figure class="tw-svg">
							<svg class="tw-svg__asset tw-svg__asset--inherit" width="20px" height="20px" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
								<path fill-opacity="0.85" d="M1.145 0.001h7.975v3.176h-4.49l0.294 3.253h4.198v3.168h-7.106zM2.152 11.193h3.189l0.224 2.54 3.553 0.951v3.316l-6.52-1.819z"/>
								<path d="M16.855 0.001h-7.96v3.176h7.666zM16.275 6.429h-7.379v3.176h3.917l-0.37 4.128-3.547 0.951v3.301l6.505-1.804z"/>
							</svg>
						</figure>
					</span>
				</button>
				<div class="tw5-многостроч tw-tooltip tw-tooltip--down tw-tooltip--align-center">
					${GetMessage('F0600')}
				</div>
			</div>
			<style>
				.tw5-многостроч
				{
					line-height: 1.4 !important;
				}
				.tw5-автоперенаправление.tw5-отключено svg
				{
					opacity: .4;
				}
				.tw5-справка > .tw-tooltip
				{
					display: block !important;
					color: white !important;
					background: #f00000 !important;
					pointer-events: auto !important;
					cursor: pointer !important;
				}
				.tw5-справка > .tw-tooltip::after
				{
					background: #f00000 !important;
				}
			</style>
		</div>
		`);
	}
	const узКнопка = document.getElementById('tw5-автоперенаправление');
	узКнопка.addEventListener('click', ОбработатьЗапускНашегоПроигрывателя);
	узКнопка.addEventListener('contextmenu', ОбработатьПереключениеАвтоперенаправления);

	if (м_Настройки.АвтоперенаправлениеВключено() === null)
	{
		узКнопка.parentNode.classList.add('tw5-справка');
		// Обрабатывать щелчок и по кнопке, и по подсказке. Обработки mousedown или mouseup недостаточно для отмены щелчка.
		узКнопка.parentNode.addEventListener('click', ОбработатьЗакрытиеСправки, true);
		узКнопка.parentNode.addEventListener('contextmenu', ОбработатьЗакрытиеСправки, true);
	}

	ОбновитьНашуКнопку();
	return true;
}

function СледитьЗаРазметкойСтраницы()
{
	(new MutationObserver((моЗаписи, оНаблюдатель) =>
	{
		if (ВставитьНашуКнопку())
		{
			оНаблюдатель.disconnect();
		}
	}))
	.observe(document.documentElement,
	{
		childList: true,
		subtree: true
	});
}

function ПерехватитьФункции()
{
	const Журнал = () => {};
	Журнал('[Twitch 5] Перехватываю функции');

	// Запретить менять адрес страницы. Twitch не использует replaceState и location.hash.
	// Также следить за изменением адреса.
	const fPushState = history.pushState;
	history.pushState = function(state, title)
	{
		if (document.documentElement.hasAttribute('data-tw5-перенаправление'))
		{
			Журнал('[Twitch 5] Изменение адреса страницы отклонено');
			return;
		}
		const сБыло = location.href;
		fPushState.apply(this, arguments);
		if (location.href !== сБыло)
		{
			window.dispatchEvent(new CustomEvent('tw5-pushstate'));
		}
	};

	// Запретить менять заголовок. Twitch не использует document.title.
	const oNodeValueDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue');
	Object.defineProperty(Node.prototype, 'nodeValue',
	{
		configurable: oNodeValueDescriptor.configurable,
		enumerable: oNodeValueDescriptor.enumerable,
		get: function()
		{
			return oNodeValueDescriptor.get.apply(this, arguments);
		},
		set: function()
		{
			const node = this.parentNode;
			if (node && node.nodeName === 'TITLE')
			{
				const doc = node.ownerDocument;
				if (doc && doc.documentElement.hasAttribute('data-tw5-перенаправление'))
				{
					Журнал('[Twitch 5] Изменение заголовка отклонено');
					return;
				}
			}
			return oNodeValueDescriptor.set.apply(this, arguments);
		}
	});
}


function ЖдатьЗагрузкуДомика()
{
	return new Promise((фВыполнить, фОтказаться) =>
	{
		Журнал('[Twitch 5] document.readyState=%s', document.readyState);
		if (document.readyState !== 'loading')
		{
			фВыполнить();
		}
		else
		{
			document.addEventListener('DOMContentLoaded', function ОбработатьЗагрузкуДомика()
			{
				try
				{
					Журнал('[Twitch 5] document.readyState=%s', document.readyState);
					document.removeEventListener('DOMContentLoaded', ОбработатьЗагрузкуДомика);
					фВыполнить();
				}
				catch (пИсключение)
				{
					фОтказаться(пИсключение);
				}
			});
		}
	});
}

function ВставитьСторонниеРасширения()
{
	chrome.runtime.sendMessage(
		{
			сЗапрос: 'ВставитьСторонниеРасширения'
		},
		оСообщение =>
		{
			if (chrome.runtime.lastError)
			{
				Журнал('[Twitch 5] Не удалось послать запрос на вставку сторонних расширений:', chrome.runtime.lastError.message);
				return;
			}
			if (оСообщение.сСторонниеРасширения === '')
			{
				return;
			}
			ЖдатьЗагрузкуДомика().then(() =>
			{
				Журнал('[Twitch 5] Вставляю сторонние расширения:', оСообщение.сСторонниеРасширения);
				if (оСообщение.сСторонниеРасширения.indexOf('BTTV ') !== -1)
				{
					const узСкрипт = document.createElement('script');
					узСкрипт.src = 'https://cdn.betterttv.net/betterttv.js';
					document.head.appendChild(узСкрипт);
				}
				if (оСообщение.сСторонниеРасширения.indexOf('FFZ ') !== -1)
				{
					const узСкрипт = document.createElement('script');
					узСкрипт.src = 'https://cdn.frankerfacez.com/script/script.min.js';
					document.head.appendChild(узСкрипт);
				}
				if (оСообщение.сСторонниеРасширения.indexOf('FFZAP ') !== -1)
				{
					const узСкрипт = document.createElement('script');
					узСкрипт.src = 'https://cdn.ffzap.com/ffz-ap.min.js';
					document.head.appendChild(узСкрипт);
				}
			});
		}
	);
}


function ИзменитьСтильЧата()
{
	const узСтиль = document.createElement('link');
	узСтиль.href = chrome.extension.getURL('content.css');
	узСтиль.rel = 'stylesheet';
	(document.head || document.documentElement).appendChild(узСтиль);
}

function ИзменитьПоведениеЧата()
{
	// Открывать ссылки с новой вкладке, а не во фрейме чата.
	if (window !== window.top)
	{
		window.addEventListener(
			'click',
			оСобытие =>
			{
				if (оСобытие.button !== ЛЕВАЯ_КНОПКА)
				{
					return;
				}
				const узСсылка = ПолучитьСсылкуВКоторойНаходится(оСобытие.target);
				if (!узСсылка)
				{
					return;
				}
				const сАдрес = узСсылка.getAttribute('href');
				if (!сАдрес)
				{
					return;
				}
				if (сАдрес.startsWith('http:') || сАдрес.startsWith('https:') || (!сАдрес.includes(':') && !сАдрес.startsWith('#')))
				{
					Журнал('[Twitch 5] Открываю ссылку в новой вкладке:', сАдрес);
					узСсылка.target = '_blank';
					// В настройках чата ссылки Manage Raid Settings и Manage Moderation Settings непонятно зачем
					// вызывают preventDefault() и самостоятельно меняют адрес текущей вкладки, игнорируя target.
					оСобытие.stopImmediatePropagation();
					оСобытие.stopPropagation();
				}
			},
			true
		);
	}
	// После работы ИзменитьСтильЧата(), карточка зрителя может выйти за нижнюю границу экрана.
	// Код страницы меняет положение карточки в обработчике события click, во время поднятия события
	// через document. Вызываем наш обработчик еще позже, во время поднятия через window.
	window.addEventListener(
		'click',
		function ОбработатьОткрытиеКарточки()
		{
			const узКарточка = document.getElementsByClassName('viewer-card-layer')[0];
			if (узКарточка)
			{
				window.removeEventListener('click', ОбработатьОткрытиеКарточки, false);
				(new MutationObserver(() =>
				{
					const узКарточка2 = узКарточка.firstElementChild;
					// Карточка открыта?
					if (узКарточка2)
					{
						const оСтиль = getComputedStyle(узКарточка2);
						Журнал(`[Twitch 5] Высота карточки=${оСтиль.height} Верх=${оСтиль.top} Низ=${оСтиль.bottom}`);
						let чНиз = Number.parseFloat(оСтиль.bottom);
						// Edge 16, Chrome 49: bottom равен auto вместо px.
						if (Number.isNaN(чНиз))
						{
							чНиз = Number.parseFloat(getComputedStyle(узКарточка).height) - Number.parseFloat(оСтиль.top) - Number.parseFloat(оСтиль.height);
						}
						if (чНиз < 0)
						{
							узКарточка2.style.top = Math.floor(Math.max(Number.parseFloat(оСтиль.top) + чНиз, 0)) + 'px';
						}
					}
				}))
				.observe(узКарточка,
				{
					childList: true,
					subtree: true
				});
			}
		},
		false
	);
}

(() =>
{
	Журнал('[Twitch 5] content.js запущен по адресу', location.href);
	ИзмененАдресСтраницы('загрузка');
	if (г_оРазобранныйАдрес.чСтраница === СТРАНИЦА_ЧАТ_КАНАЛА)
	{
		if (window !== window.top)
		{
			ВставитьСторонниеРасширения();
		}
		ИзменитьСтильЧата();
		ИзменитьПоведениеЧата();
		return;
	}
	if (window !== window.top)
	{
		return;
	}
	// window и capture нужны, чтобы перенаправить как можно быстрее, до выполнения медленного кода страницы.
	// Также нужна возможность скрыть событие от кода страницы.
	window.addEventListener('mousedown', ОбработатьЩелчокМыши, true);
	window.addEventListener('click', ОбработатьЩелчокМыши, true);
	window.addEventListener('popstate', ОбработатьPopState, true);
	window.addEventListener('tw5-pushstate', ОбработатьPushState);
	// Не замедлять переход по страницам. Обычно браузер ждет завершения XHR.
	window.addEventListener('unload', ОтменитьЗапрос);
	СледитьЗаРазметкойСтраницы();
	ВставитьНаСтраницу(ПерехватитьФункции);
})();
