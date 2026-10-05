import Cart from './ui/cart';
import { catalog } from '../lib/server/data';
import { formatPrice } from '../lib/shared/format';
export default function Page() { return <Cart title={formatPrice(catalog.price)} />; }
