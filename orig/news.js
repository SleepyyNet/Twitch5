﻿'use strict';

const м_Новости = (() =>
{
	const ПОКАЗАТЬ_ОДИН_РАЗ = '2000.1.1';
	const ПОКАЗЫВАТЬ_ВСЕГДА = '2000.2.2';
	const ПОЛНАЯ_СПРАВКА    = '2000.3.3';
	const ДЛЯ_ПЛАНШЕТА      = '2000.4.4';

	// 0 - версия расширения, она же дата новости.
	// 1 - код заголовка новости.
	// 2 - код текста новости (длина текста < 1024 символа).
	const _мНовости =
	[
		// ↓↓↓ ВСТАВЛЯТЬ СЮДА ↓↓↓
		['2018.6.27',       'J1010', 'F1058'],
		['2018.6.12',       'J1010', 'F1057'],
		['2018.5.18',       'J1010', 'F1049'],
		['2018.4.24',       'J1036', 'F1048'],
		['2018.4.6',        'J1010', 'F1047'],
		['2018.3.17',       'J1010', 'F1046'],
		['2018.3.4',        'J1041', 'F1042'],
		['2018.2.17',       'J1010', 'F1044'],
		['2018.1.7',        'J1010', 'F1043'],
		['2017.11.6',       'J1010', 'F1037', 'F1038'],
		['2017.10.22',      'J1010', 'F1023'],
		['2017.10.14',      'J1010', 'F1020'],
		['2017.9.11',       'J1010', 'F1018'],
		['2017.8.8',        'J1035', 'F1017'],
		['2017.6.23',       'J1010', 'F1014'],
		['2017.5.29',       'J1010', 'F1013'],
		['2017.3.31',       'J1031', 'F1012'],
		['2017.2.26',       'J1030', 'F1011'],
		// ↑↑↑ УДАЛЯТЬ ОТСЮДА ↑↑↑
		[ПОЛНАЯ_СПРАВКА,    'J1500', 'F1501', 'F1502', 'F1503', 'F1504', 'F1505', 'F1506', 'F1507', 'F1508', 'F1509',
									 'F1570', 'F1571', 'F1573', 'F1574', 'F1572',
									 'F1511', 'F1510'],
		[ПОКАЗАТЬ_ОДИН_РАЗ, 'J1054', 'F1501'],
		// UNDONE Удалить новость в августе.
		[ПОКАЗЫВАТЬ_ВСЕГДА, 'J1052', 'F1053'],
		[ДЛЯ_ПЛАНШЕТА,      'J1055', 'F1056'],
		[ПОКАЗЫВАТЬ_ВСЕГДА, 'J1003', 'F1000'],
	];

	function ПеревестиВерсиюВМиллисекунды(сВерсия)
	// Возвращает Date.getTime(). Число можно использовать для сравнения версий.
	{
		const мчЧасти = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/.exec(сВерсия);
		мчЧасти[1] |= 0;
		мчЧасти[2] |= 0;
		мчЧасти[3] |= 0;
		мчЧасти[4] |= 0;
		Проверить(мчЧасти[1] >= 2000 && мчЧасти[1] <= 2050);
		Проверить(мчЧасти[2] >=    1 && мчЧасти[2] <=   12);
		Проверить(мчЧасти[3] >=    1 && мчЧасти[3] <=   31);
		Проверить(мчЧасти[4] >=    0 && мчЧасти[4] <=    9);
		return Date.UTC(мчЧасти[1], мчЧасти[2] - 1, мчЧасти[3], 0, 0, 0, мчЧасти[4]);
	}

	function ЕстьНовостиСВерсиейСтарше(сВерсия)
	// Возвращает true, если в _мНовости есть новости с версией старше сВерсия.
	{
		const чВерсия = ПеревестиВерсиюВМиллисекунды(сВерсия);
		return _мНовости.some(мНовость => ПеревестиВерсиюВМиллисекунды(мНовость[0]) > чВерсия);
	}

	function ДобавитьНовости(кМаксимумНовостей, чДобавитьВерсииСтарше, сДобавитьЭтуВерсию = '')
	// Добавляет из _мНовости в окно указанные новости.
	// кМаксимумНовостей - максимальное количество добавляемых новостей, исключяя сДобавитьЭтуВерсию.
	// чДобавитьВерсииСтарше - добавлять новости с версией > чДобавитьВерсииСтарше.
	// сДобавитьЭтуВерсию - также добавить все новости с этой версией.
	{
		Проверить(ЭтоЧисло(кМаксимумНовостей) && кМаксимумНовостей >= 0);
		Проверить(ЭтоЧисло(чДобавитьВерсииСтарше) && чДобавитьВерсииСтарше >= 0);
		Проверить(typeof сДобавитьЭтуВерсию === 'string');
		УдалитьВсеНовости();
		// Самые свежие новости находятся в начале массива и в начале текста.
		for (let мНовость of _мНовости)
		{
			const сВерсия = мНовость[0];
			if (сВерсия.startsWith('2000'))
			{
				if (сВерсия === ПОКАЗЫВАТЬ_ВСЕГДА || (сВерсия === ДЛЯ_ПЛАНШЕТА && ЭТО_ПЛАНШЕТ))
				{
					ДобавитьНовость(мНовость, 0);
				}
				else if (сВерсия === сДобавитьЭтуВерсию)
				{
					ДобавитьНовость(мНовость, 0);
				}
			}
			else
			{
				if (--кМаксимумНовостей >= 0)
				{
					const чВерсия = ПеревестиВерсиюВМиллисекунды(сВерсия);
					if (чВерсия > чДобавитьВерсииСтарше)
					{
						ДобавитьНовость(мНовость, чВерсия);
					}
				}
			}
		}
	}

	function УдалитьВсеНовости()
	{
		document.getElementById('текстновостей').textContent = '';
	}

	function ДобавитьНовость(мНовость, чДатаНовости)
	{
		const узВставить = Узел('текстновостей');

		if (узВставить.firstElementChild)
		{
			узВставить.appendChild(document.createElement('hr'));
		}

		const узЗаголовок = document.createElement('h4');
		if (чДатаНовости === 0)
		{
			узЗаголовок.textContent = Текст(мНовость[1]);
		}
		else
		{
			узЗаголовок.textContent = `${(new Date(чДатаНовости)).toLocaleDateString()}\u2002·\u2002${Текст(мНовость[1])}`;
		}
		узВставить.appendChild(узЗаголовок);

		for (let ы = 2; ы < мНовость.length; ++ы)
		{
			м_i18n.InsertAdjacentHtmlMessage(узВставить, 'beforeend', мНовость[ы]);
		}
	}

	function ОткрытьОкно(лПодтвердитьПрочтение)
	{
		if (лПодтвердитьПрочтение)
		{
			м_i18n.InsertAdjacentHtmlMessage('закрытьновости', 'content', 'F0619')
			.title = Текст('A0620');
			ПоказатьЭлемент('отложитьновости', true);
		}
		else
		{
			м_i18n.InsertAdjacentHtmlMessage('закрытьновости', 'content', 'F0663')
			.title = '';
			ПоказатьЭлемент('отложитьновости', false);
		}

		const узТекст = Узел('текстновостей');
		узТекст.scrollTop = 0;
		ПоказатьИндикаторПрокрутки(!ЭлементПолностьюПрокручен(узТекст));

		м_События.ДобавитьОбработчик('управление-левыйщелчок', ОбработатьЛевыйЩелчок);
		м_События.ДобавитьОбработчик('окна-закрыто-новости', ОбработатьЗакрытиеОкна);

		м_Окна.Открыть('новости');
	}

	function ПоказатьИндикаторПрокрутки(лПоказать)
	{
		ПоказатьЭлемент('прокрутитьновости', лПоказать);
		Узел('текстновостей')[лПоказать ? 'addEventListener' : 'removeEventListener']('scroll', ОбработатьПрокруткуТекста);
	}

	const ОбработатьПрокруткуТекста = ДобавитьОбработчикИсключений(оСобытие =>
	{
		if (ЭлементПолностьюПрокручен(оСобытие.target))
		{
			ПоказатьИндикаторПрокрутки(false);
		}
	});

	function ОбработатьЛевыйЩелчок({сПозывной})
	{
		if (сПозывной === 'закрытьновости' && ЭлементПоказан('отложитьновости'))
		{
			ПоказатьЭлемент('открытьновости', false);
			м_Настройки.Изменить('сПредыдущаяВерсия', ВЕРСИЯ_РАСШИРЕНИЯ);
		}
	}

	function ОбработатьЗакрытиеОкна()
	{
		// Отключить анимацию индикатора, чтобы не нагружать процессор.
		ПоказатьИндикаторПрокрутки(false);
		// Не удалять текст, чтобы не портить анимацию закрытия окна.
	}

	function ОткрытьСправку()
	{
		ДобавитьНовости(0, 0, ПОЛНАЯ_СПРАВКА);
		ОткрытьОкно(false);
	}

	function ОткрытьНовости()
	{
		const {пТекущее: сПредыдущаяВерсия, пНачальное: сНачальнаяВерсия} = м_Настройки.ПолучитьПараметрыНастройки('сПредыдущаяВерсия');
		// Первый запуск расширения?
		if (сПредыдущаяВерсия === сНачальнаяВерсия)
		{
			ДобавитьНовости(0, 0, ПОКАЗАТЬ_ОДИН_РАЗ);
			ОткрытьОкно(false);
			ПоказатьЭлемент('открытьновости', false);
			м_Настройки.Изменить('сПредыдущаяВерсия', ВЕРСИЯ_РАСШИРЕНИЯ);
		}
		else if (сПредыдущаяВерсия !== ВЕРСИЯ_РАСШИРЕНИЯ)
		{
			ДобавитьНовости(Infinity, ПеревестиВерсиюВМиллисекунды(сПредыдущаяВерсия));
			ОткрытьОкно(true);
			Узел('открытьновости').classList.remove('непрочитано');
		}
		else
		{
			ДобавитьНовости(10, 0);
			ОткрытьОкно(false);
		}
	}

	function Запустить()
	{
		const {пТекущее: сПредыдущаяВерсия, пНачальное: сНачальнаяВерсия} = м_Настройки.ПолучитьПараметрыНастройки('сПредыдущаяВерсия');
		if (сПредыдущаяВерсия !== ВЕРСИЯ_РАСШИРЕНИЯ)
		{
			м_Журнал.Окак(`[Новости] Версия расширения изменилась с ${сПредыдущаяВерсия} на ${ВЕРСИЯ_РАСШИРЕНИЯ}`);
			// У новой версии расширения есть новости?
			if (сПредыдущаяВерсия === сНачальнаяВерсия || ЕстьНовостиСВерсиейСтарше(сПредыдущаяВерсия))
			{
				ПоказатьЭлемент('открытьновости', true)
				.classList.add('непрочитано');
			}
			else
			{
				м_Настройки.Изменить('сПредыдущаяВерсия', ВЕРСИЯ_РАСШИРЕНИЯ);
				// Элемент 'открытьновости' изначально скрыт.
			}
		}
	}
	
	return {
		Запустить,
		ОткрытьНовости, ОткрытьСправку
	};
})();
