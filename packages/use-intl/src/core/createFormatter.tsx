import {ReactElement} from 'react';
import DateTimeFormatOptions from './DateTimeFormatOptions';
import Formats from './Formats';
import IntlError, {IntlErrorCode} from './IntlError';
import NumberFormatOptions from './NumberFormatOptions';
import RelativeTimeFormatOptions from './RelativeTimeFormatOptions';
import TimeZone from './TimeZone';
import {defaultOnError} from './defaults';

const SECOND = 1;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * (365 / 12); // Approximation
const QUARTER = MONTH * 3;
const YEAR = DAY * 365;

const UNIT_SECONDS: Record<Intl.RelativeTimeFormatUnit, number> = {
  second: SECOND,
  seconds: SECOND,
  minute: MINUTE,
  minutes: MINUTE,
  hour: HOUR,
  hours: HOUR,
  day: DAY,
  days: DAY,
  week: WEEK,
  weeks: WEEK,
  month: MONTH,
  months: MONTH,
  quarter: QUARTER,
  quarters: QUARTER,
  year: YEAR,
  years: YEAR
} as const;

function resolveRelativeTimeUnit(seconds: number) {
  const absValue = Math.abs(seconds);

  if (absValue < MINUTE) {
    return 'second';
  } else if (absValue < HOUR) {
    return 'minute';
  } else if (absValue < DAY) {
    return 'hour';
  } else if (absValue < WEEK) {
    return 'day';
  } else if (absValue < MONTH) {
    return 'week';
  } else if (absValue < YEAR) {
    return 'month';
  }
  return 'year';
}

function calculateRelativeTimeValue(
  seconds: number,
  unit: Intl.RelativeTimeFormatUnit
) {
  // We have to round the resulting values, as `Intl.RelativeTimeFormat`
  // will include fractions like '2.1 hours ago'.
  return Math.round(seconds / UNIT_SECONDS[unit]);
}

type Props = {
  locale: string;
  timeZone?: TimeZone;
  onError?(error: IntlError): void;
  formats?: Partial<Formats>;
  now?: Date;
};

export default function createFormatter({
  formats,
  locale,
  now: globalNow,
  onError = defaultOnError,
  timeZone: globalTimeZone
}: Props) {
  function applyTimeZone(options?: DateTimeFormatOptions) {
    if (!options?.timeZone) {
      if (globalTimeZone) {
        options = {...options, timeZone: globalTimeZone};
      } else {
        onError(
          new IntlError(
            IntlErrorCode.ENVIRONMENT_FALLBACK,
            process.env.NODE_ENV !== 'production'
              ? `The \`timeZone\` parameter wasn't provided and there is no global default configured. Consider adding a global default to avoid markup mismatches caused by environment differences. Learn more: https://next-intl-docs.vercel.app/docs/configuration#time-zone`
              : undefined
          )
        );
      }
    }

    return options;
  }

  function resolveFormatOrOptions<Options>(
    typeFormats: Record<string, Options> | undefined,
    formatOrOptions?: string | Options
  ) {
    let options;
    if (typeof formatOrOptions === 'string') {
      const formatName = formatOrOptions;
      options = typeFormats?.[formatName];

      if (!options) {
        const error = new IntlError(
          IntlErrorCode.MISSING_FORMAT,
          process.env.NODE_ENV !== 'production'
            ? `Format \`${formatName}\` is not available. You can configure it on the provider or provide custom options.`
            : undefined
        );
        onError(error);
        throw error;
      }
    } else {
      options = formatOrOptions;
    }

    return options;
  }

  function getFormattedValue<Options, Output>(
    formatOrOptions: string | Options | undefined,
    typeFormats: Record<string, Options> | undefined,
    formatter: (options?: Options) => Output,
    getFallback: () => Output
  ) {
    let options;
    try {
      options = resolveFormatOrOptions(typeFormats, formatOrOptions);
    } catch (error) {
      return getFallback();
    }

    try {
      return formatter(options);
    } catch (error) {
      onError(
        new IntlError(IntlErrorCode.FORMATTING_ERROR, (error as Error).message)
      );
      return getFallback();
    }
  }

  function dateTime(
    /** If a number is supplied, this is interpreted as a UTC timestamp. */
    value: Date | number,
    /** If a time zone is supplied, the `value` is converted to that time zone.
     * Otherwise the user time zone will be used. */
    formatOrOptions?: string | DateTimeFormatOptions
  ) {
    return getFormattedValue(
      formatOrOptions,
      formats?.dateTime,
      (options) => {
        options = applyTimeZone(options);
        return new Intl.DateTimeFormat(locale, options).format(value);
      },
      () => String(value)
    );
  }

  function dateTimeRange(
    /** If a number is supplied, this is interpreted as a UTC timestamp. */
    start: Date | number,
    /** If a number is supplied, this is interpreted as a UTC timestamp. */
    end: Date | number,
    /** If a time zone is supplied, the values are converted to that time zone.
     * Otherwise the user time zone will be used. */
    formatOrOptions?: string | DateTimeFormatOptions
  ) {
    return getFormattedValue(
      formatOrOptions,
      formats?.dateTime,
      (options) => {
        options = applyTimeZone(options);
        return new Intl.DateTimeFormat(locale, options).formatRange(start, end);
      },
      () => [dateTime(start), dateTime(end)].join(' – ')
    );
  }

  function number(
    value: number | bigint,
    formatOrOptions?: string | NumberFormatOptions
  ) {
    return getFormattedValue(
      formatOrOptions,
      formats?.number,
      (options) => new Intl.NumberFormat(locale, options).format(value),
      () => String(value)
    );
  }

  function getGlobalNow() {
    if (globalNow) {
      return globalNow;
    } else {
      onError(
        new IntlError(
          IntlErrorCode.ENVIRONMENT_FALLBACK,
          process.env.NODE_ENV !== 'production'
            ? `The \`now\` parameter wasn't provided and there is no global default configured. Consider adding a global default to avoid markup mismatches caused by environment differences. Learn more: https://next-intl-docs.vercel.app/docs/configuration#now`
            : undefined
        )
      );
      return new Date();
    }
  }

  function extractNowDate(
    nowOrOptions?: RelativeTimeFormatOptions['now'] | RelativeTimeFormatOptions
  ) {
    if (nowOrOptions instanceof Date || typeof nowOrOptions === 'number') {
      return new Date(nowOrOptions);
    }
    if (nowOrOptions?.now !== undefined) {
      return new Date(nowOrOptions.now);
    }
    return getGlobalNow();
  }

  function relativeTime(
    /** The date time that needs to be formatted. */
    date: number | Date,
    /** The reference point in time to which `date` will be formatted in relation to.  */
    nowOrOptions?: RelativeTimeFormatOptions['now'] | RelativeTimeFormatOptions
  ) {
    try {
      const dateDate = new Date(date);
      const nowDate = extractNowDate(nowOrOptions);
      const seconds = (dateDate.getTime() - nowDate.getTime()) / 1000;

      const unit =
        typeof nowOrOptions === 'number' ||
        nowOrOptions instanceof Date ||
        nowOrOptions?.unit === undefined
          ? resolveRelativeTimeUnit(seconds)
          : nowOrOptions.unit;

      const value = calculateRelativeTimeValue(seconds, unit);

      return new Intl.RelativeTimeFormat(locale, {
        // `numeric: 'auto'` can theoretically produce output like "yesterday",
        // but it only works with integers. E.g. -1 day will produce "yesterday",
        // but -1.1 days will produce "-1.1 days". Rounding before formatting is
        // not desired, as the given dates might cross a threshold were the
        // output isn't correct anymore. Example: 2024-01-08T23:00:00.000Z and
        // 2024-01-08T01:00:00.000Z would produce "yesterday", which is not the
        // case. By using `always` we can ensure correct output. The only exception
        // is the formatting of times <1 second as "now".
        numeric: unit === 'second' ? 'auto' : 'always'
      }).format(value, unit);
    } catch (error) {
      onError(
        new IntlError(IntlErrorCode.FORMATTING_ERROR, (error as Error).message)
      );
      return String(date);
    }
  }

  type FormattableListValue = string | ReactElement;
  function list<Value extends FormattableListValue>(
    value: Iterable<Value>,
    formatOrOptions?: string | Intl.ListFormatOptions
  ): Value extends string ? string : Iterable<ReactElement> {
    const serializedValue: Array<string> = [];
    const richValues = new Map<string, Value>();

    // `formatToParts` only accepts strings, therefore we have to temporarily
    // replace React elements with a placeholder ID that can be used to retrieve
    // the original value afterwards.
    let index = 0;
    for (const item of value) {
      let serializedItem;
      if (typeof item === 'object') {
        serializedItem = String(index);
        richValues.set(serializedItem, item);
      } else {
        serializedItem = String(item);
      }
      serializedValue.push(serializedItem);
      index++;
    }

    return getFormattedValue<
      Intl.ListFormatOptions,
      Value extends string ? string : Iterable<ReactElement>
    >(
      formatOrOptions,
      formats?.list,
      // @ts-expect-error -- `richValues.size` is used to determine the return type, but TypeScript can't infer the meaning of this correctly
      (options) => {
        const result = new Intl.ListFormat(locale, options)
          .formatToParts(serializedValue)
          .map((part) =>
            part.type === 'literal'
              ? part.value
              : richValues.get(part.value) || part.value
          );

        if (richValues.size > 0) {
          return result;
        } else {
          return result.join('');
        }
      },
      () => String(value)
    );
  }

  return {dateTime, number, relativeTime, list, dateTimeRange};
}
