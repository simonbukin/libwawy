import { redirect } from "next/navigation";

export default function WishlistAddRedirect() {
  redirect("/lists/add");
}
