import Cart from '../fidelity/kokonut/cart-button';
import {Milk,Croissant,Cherry} from 'lucide-react';
import {FidelityScope} from '../fidelity/scope';
export interface ShoppingCartItem {id:string;name:string;detail:string;price:number;kind?:'drink'|'bread'|'fruit';max?:number}
export function ShoppingCartView({items,initialQuantities={},currency='¥',onCheckout}:{items:readonly ShoppingCartItem[];initialQuantities?:Record<string,number>;currency?:string;onCheckout?:(quantities:Record<string,number>)=>void}) {const icons={drink:Milk,bread:Croissant,fruit:Cherry};return <FidelityScope module="cart-button"><Cart items={items.map(item=>({...item,icon:icons[item.kind??'drink'],tint:'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300'}))} defaultQuantities={initialQuantities} currency={currency} onCheckout={onCheckout}/></FidelityScope>}
