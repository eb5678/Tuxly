import { 
  Badge, Input, Card, Empty, Button, Dialog, DialogContent, 
  DialogDescription, DialogFooter, DialogHeader, DialogTitle 
} from "@/components";
import { useHistory } from "@/hooks";
import { PageLayout } from "@/layouts";
import { MessageCircleIcon, Search, Trash2Icon, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { deleteAllConversations } from "@/lib";

const dateFormatter = new Intl.DateTimeFormat("en-US", { weekday: 'short', month: 'short', day: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: '2-digit', minute: '2-digit' });

const Dashboard = () => {
  const conversations = useHistory();
  const navigate = useNavigate();
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      await deleteAllConversations();
      await conversations.refreshConversations();
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  // Group conversations by isolated UTC date string without libraries
  const groupedConversations = conversations.conversations.reduce(
    (acc, doc) => {
      const d = new Date(doc.updatedAt);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(doc);
      return acc;
    },
    {} as Record<string, typeof conversations.conversations>
  );

  // Sort dates descending
  const sortedDates = Object.keys(groupedConversations).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <PageLayout
      title="All conversations"
      description="View all your conversations"
      rightSlot={
        conversations.conversations.length > 0 && (
          <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)} className="h-9">
            <Trash2Icon className="mr-2 h-4 w-4" /> Delete All
          </Button>
        )
      }
    >
      <>
        {conversations.conversations.length === 0 ? (
          <Empty isLoading={conversations.isLoading} icon={MessageCircleIcon} title="No conversations found" description="Start a new conversation to get started" />
        ) : (
          <div className="flex flex-col gap-6 pb-8">
            <div className="relative mb-4 w-1/3">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="text" placeholder="Search conversations..." className="pl-9 focus-visible:ring-0 focus-visible:ring-offset-0" value={conversations.search} onChange={(e) => conversations.setSearch(e.target.value)} />
            </div>
            {sortedDates
              .filter((dateKey) => conversations?.search?.length === 0 ? true : groupedConversations?.[dateKey]?.some((doc) => doc?.title.toLowerCase().includes(conversations?.search?.toLowerCase() || "")))
              .map((dateKey) => {
                // Ensure correct timeline parse avoiding timezone skew
                const displayDate = new Date(dateKey + 'T12:00:00');
                
                return (
                  <div key={dateKey} className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground select-none font-medium">
                      {dateFormatter.format(displayDate)}
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      {groupedConversations[dateKey].map((doc) => (
                        <Card key={doc.id} className="shadow-none select-none p-4 gap-0 group relative transition-all !bg-black/5 dark:!bg-white/5 hover:!border-primary/50 cursor-pointer" onClick={() => navigate(`/chats/view/${doc.id}`)}>
                          <div className="flex items-center justify-between">
                            <p className="line-clamp-1 text-sm mr-8">{doc.title}</p>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-xs">{doc.messages.length} messages</Badge>
                              <Badge variant="outline" className="text-xs">{timeFormatter.format(doc.updatedAt)}</Badge>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
              )})}
          </div>
        )}

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Delete All Conversations</DialogTitle>
              <DialogDescription>Are you sure you want to delete all chat history? This action cannot be undone and will permanently remove all stored conversations.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteAll} disabled={isDeleting}>
                {isDeleting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>) : "Delete All"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    </PageLayout>
  );
};
export default Dashboard;