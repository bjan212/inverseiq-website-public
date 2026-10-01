import { useState } from "react";
import { Bell, Check, CheckCheck, MessageSquare, Settings, X } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/contexts/NotificationContext";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function NotificationCenter() {
  const { notifications, unreadCount, isConnected, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "signal_hit_tp":
        return "🎯";
      case "signal_hit_sl":
        return "⚠️";
      case "signal_expired":
        return "⏰";
      case "signal_verified":
        return "✅";
      default:
        return "📢";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "signal_hit_tp":
        return "text-green-500";
      case "signal_hit_sl":
        return "text-red-500";
      case "signal_expired":
        return "text-yellow-500";
      case "signal_verified":
        return "text-blue-500";
      default:
        return "text-gray-500";
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
          {isConnected && (
            <span className="absolute bottom-0 right-0 h-2 w-2 bg-green-500 rounded-full border border-background"></span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(380px,calc(100vw-2rem))] max-h-[80vh]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                markAllAsRead();
              }}
              className="h-auto py-1 px-2 text-xs"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "flex flex-col items-start gap-2 p-4 cursor-pointer",
                  notification.isRead === 0 && "bg-primary/5"
                )}
                onClick={() => {
                  if (notification.isRead === 0) {
                    markAsRead(notification.id);
                  }
                }}
              >
                <div className="flex items-start gap-3 w-full">
                  <span className="text-2xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "font-semibold text-sm leading-tight",
                        notification.isRead === 0 && "text-foreground",
                        notification.isRead === 1 && "text-muted-foreground"
                      )}>
                        {notification.title}
                      </p>
                      {notification.isRead === 0 && (
                        <span className="h-2 w-2 bg-primary rounded-full flex-shrink-0 mt-1"></span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
        
        <DropdownMenuSeparator />
        <Link href="/settings/notifications">
          <DropdownMenuItem className="cursor-pointer">
            <Settings className="h-4 w-4 mr-2" />
            <span>Notification Settings</span>
          </DropdownMenuItem>
        </Link>
        <Link href="/settings/telegram">
          <DropdownMenuItem className="cursor-pointer">
            <MessageSquare className="h-4 w-4 mr-2" />
            <span>Telegram Alerts</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
