function CartComponent({ userId }) {
  const { cart, addToCart, removeFromCart, loading } = useCartData(userId);
  
  return (
    <div>
      <h3>Shopping Cart ({cart?.items?.length || 0} items)</h3>
      {loading && <p>Loading cart...</p>}
      {cart?.items?.map(item => (
        <div key={item.id}>
          {item.name} - ${item.price} x {item.quantity}
          <button onClick={() => removeFromCart(item.id)}>Remove</button>
        </div>
      ))}
      <p>Total: ${cart?.total || 0}</p>
    </div>
  );
}