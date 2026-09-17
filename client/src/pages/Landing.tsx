import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Network, Layers, LayoutTemplate, Tag, Folder, Timer, ShoppingCartPlus } from "lucide-react";
import { PrintifyBeam } from "@/components/ui/printify-beam";
import { useForceLightMode } from "@/hooks/use-force-light-mode";
import { cn } from "@/lib/utils";
import { Marquee } from "@/components/ui/marquee";

const FEATURES = [
    {
        icon: Network,
        title: "Multi-Account Publish Manager",
        description:
            "Connect every Printify account and shop into one dashboard, then publish and manage listings across all of them without switching tabs.",
    },
    {
        icon: Layers,
        title: "Bulk Listing",
        description:
            "Select dozens of products at once to publish, delete, or copy to another store — no more repeating the same click one listing at a time.",
    },
    {
        icon: LayoutTemplate,
        title: "Templates",
        description:
            "Save your pricing and variants as a reusable template so new listings take seconds, not minutes, to set up.",
    },
];

const featurescard = [
    {
        icon: Tag,
        feature: "Bulk copy",
        color: "bg-blue-500/20",
    },
    {
        icon: Layers,
        feature: "Bulk listing",
        color: "bg-green-500/20",
    },
    {
        icon: LayoutTemplate,
        feature: "Listing templates",
        color: "bg-yellow-500/20",
    },
    {
        icon: Network,
        feature: "Cross-account",
        color: "bg-red-500/20",
    },
    {
        icon: Folder,
        feature: "Media library",
        color: "bg-purple-500/20",
    },
    {
        icon: Timer,
        feature: "Scheduled publishing",
        color: "bg-pink-500/20",
    },
    {
        icon: ShoppingCartPlus,
        feature: "Manage orders",
        color: "bg-indigo-500/20",
    },
]
const FeatureCard = ({
    icon: Icon, // <-- Ubah ke huruf kapital agar bisa jadi tag JSX
    feature,
    color,
}: {
    icon: React.ElementType // <-- Ubah tipe datanya ke ElementType
    feature: string
    color: string
}) => {
    return (
        <figure
            className={cn(
                "relative h-full w-48 cursor-pointer overflow-hidden rounded-xl border p-4",
                `border ${color}`,
                "dark:border-gray-50/[.1] dark:bg-gray-50/[.10] dark:hover:bg-gray-50/[.15]"
            )}
        >
            <div className="flex flex-row items-center gap-2">
                <div className="flex flex-row gap-2 items-center">
                    <figcaption className="text-sm font-medium dark:text-white flex items-center gap-2">
                        <Icon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    </figcaption>
                    <p className="text-xs font-medium dark:text-white/40">{feature}</p>
                </div>
            </div>
        </figure>
    )
}

export default function Landing() {
    const loggedIn = !!localStorage.getItem("token");

    // Marketing page always renders in light mode, regardless of the visitor's
    // (or app's) dark-mode preference.
    useForceLightMode(!loggedIn);

    // Already signed in — "/" is the marketing page for anonymous visitors only.
    if (loggedIn) return <Navigate to="/products" replace />;

    return (
        <div className="relative min-h-screen overflow-hidden">
            {/* Soft glow behind the hero copy — purely decorative. */}
            <div className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[500px] bg-accent/20 blur-3xl" />

            <div className="flex flex-col items-center w-full max-w-7xl mx-auto my-auto min-h-screen p-16 gap-6">
                <header className="w-full items-center flex justify-between">
                    <div className="flex items-center text-center">
                        <span className="text-accent text-3xl font-logo">golistee</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" render={<Link to="/login" />} nativeButton={false}>
                            Login
                        </Button>
                        <Button className="bg-accent hover:bg-accent/80" render={<Link to="/register" />} nativeButton={false}>
                            Get Started
                        </Button>
                    </div>
                </header>

                <section className="w-full max-w-7xl flex-1 flex flex-col">
                    <div className="flex items-center flex-col justify-center text-center space-y-3 flex-1">
                        <h2 className="text-3xl font-black tracking-tight text-balance">
                            Less clicking, <span className="text-accent">more selling.</span>
                        </h2>
                        <p className="text-muted-foreground text-balance text-sm">
                            Every feature exists to cut the busywork of juggling multiple accounts down to a few clicks.
                        </p>
                        <Button className="bg-accent hover:bg-accent/80" render={<Link to="/register" />} nativeButton={false}>
                            Get Started
                        </Button>
                    </div>
                </section>
                <div className="flex flex-row items-center gap-6 w-full">
                    <div className="grid grid-cols-5 items-center flex-1 gap-6">
                        <PrintifyBeam className="w-full h-full col-span-3 border rounded-xl bg-card" />
                        <div className="relative w-full h-[400px] col-span-2 border rounded-xl bg-card overflow-hidden flex flex-row items-center justify-center [perspective:300px]">
                            <div
                                className="flex flex-row items-center gap-4"
                                style={{
                                    transform:
                                        "translateX(-100px) translateY(0px) translateZ(-100px) rotateX(20deg) rotateY(-10deg) rotateZ(20deg)",
                                }}
                            >
                                <Marquee pauseOnHover={false} vertical className="[--duration:20s]">
                                    {featurescard.map((review) => (
                                        <FeatureCard key={review.feature} {...review} />
                                    ))}
                                </Marquee>
                                <Marquee reverse pauseOnHover={false} vertical className="[--duration:20s]">
                                    {featurescard.map((review) => (
                                        <FeatureCard key={review.feature} {...review} />
                                    ))}
                                </Marquee>
                                <Marquee pauseOnHover={false} vertical className="[--duration:20s]">
                                    {featurescard.map((review) => (
                                        <FeatureCard key={review.feature} {...review} />
                                    ))}
                                </Marquee>
                                <Marquee reverse pauseOnHover={false} vertical className="[--duration:20s]">
                                    {featurescard.map((review) => (
                                        <FeatureCard key={review.feature} {...review} />
                                    ))}
                                </Marquee>
                                </div>
                                <div className="from-background pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-linear-to-b"></div>
                                <div className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t"></div>

                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
                        {FEATURES.map(({ icon: Icon, title, description }) => (
                            <Card key={title}>
                                <CardHeader>
                                    <div className="size-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center mb-2">
                                        <Icon className="size-5" />
                                    </div>
                                    <CardTitle>{title}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription>{description}</CardDescription>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
            );
}
