const prisma = require("../config/prisma");

exports.insertCart = async (req, res) => {
    try {
        const { cart } = req.body; // cart = [{ itemId, itemType, qty, price }, ...]
        if (!cart) {
            return res.status(400).json({ message: "Cart is empty" });
        }

        // Create a new cart
        const newCart = await prisma.cart.create({ data: {} });

        // Add items to cartDetails
        const cartDetails = await Promise.all(
            cart.map(async (item) => {
                return await prisma.cartDetail.create({
                    data: {
                        cartId: newCart.id,
                        itemId: item.itemId,
                        itemType: item.itemType,
                        qty: item.qty,
                        price: item.price
                    }
                });
            })
        );

        res.status(201).json({ message: "Cart created", cartId: newCart.id, cartDetails });
    } catch (error) {
        console.error("Error inserting cart:", error);
        res.status(500).json({ message: "Error inserting cart" });
    }
};

exports.getCart = async (req, res) => {
    try {
        const { cartId } = req.query; // Use query parameter for cartId

        if (!cartId) {
            return res.status(400).json({ message: "Cart ID is required" });
        }

        // Retrieve the cart with its details
        const cart = await prisma.cart.findUnique({
            where: { id: Number(cartId) },
            include: {
                cartDetails: {
                    include: {
                        Food: true,  // Include food details if the item is a food item
                        Drink: true  // Include drink details if the item is a drink item
                    }
                }
            }
        });

        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        // Respond with the cart details
        const detailedCart = cart.cartDetails.map(item => ({
            id: item.id,
            name: item.itemType === "food" ? item.Food?.name : item.Drink?.name,
            imageUrl: item.itemType === "food" ? item.Food?.imageUrl : item.Drink?.imageUrl,
            qty: item.qty,
            price: item.price,
            type: item.itemType
        }));

        res.status(200).json({ cart: detailedCart });
    } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).json({ message: "Error fetching cart" });
    }
};

exports.delCartItem = async (req, res) => {
    const { cartItemId } = req.body;
    try {
        await prisma.cartDetail.delete({
            where: {
                id: cartItemId
            }
        });
        res.status(200).json({ message: "Item removed from cart successfully." });
    } catch (error) {
        res.status(500).json({ message: "Error removing item from cart" });
    }
};

// New function to update the cart item quantity
exports.updateCart = async (req, res) => {
    const { cartItemId, qty } = req.body;  // cartItemId: the id of the cart item, qty: new quantity
    try {
        if (qty <= 0) {
            return res.status(400).json({ message: "Quantity must be greater than zero" });
        }

        const updatedCartDetail = await prisma.cartDetail.update({
            where: { id: cartItemId },
            data: { qty: qty }
        });

        res.status(200).json({ message: "Cart item updated successfully", updatedCartDetail });
    } catch (error) {
        console.error("Error updating cart item:", error);
        res.status(500).json({ message: "Error updating cart item" });
    }
};
