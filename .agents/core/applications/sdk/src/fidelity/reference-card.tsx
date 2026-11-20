// Fixed free MIT Kokonut UI 655ec61161aff87721e4c60c3cc4dc3329f3e80e, components/ui/card.tsx.
// Copyright (c) 2025 kokonutUI. Full license: ../../THIRD_PARTY_NOTICES.txt
import {forwardRef,type HTMLAttributes} from 'react';import {cn} from '../lib/utils';
export const Card=forwardRef<HTMLDivElement,HTMLAttributes<HTMLDivElement>>(function Card({className,...props},ref){return <div {...props} ref={ref} className={cn('rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-xs dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50',className)}/>;});
