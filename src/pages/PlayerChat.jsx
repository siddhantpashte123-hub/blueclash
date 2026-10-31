import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import ChatConversation from "../components/ChatConversation.jsx";
import { Loader, useAuth } from "../shared.jsx";

export default function PlayerChat() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="container narrow-page">
        <Loader />
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/auth"
        replace
        state={{
          from: `/entries/${id}/chat`,
          message: "Sign in to open your private tournament chat.",
        }}
      />
    );
  return (
    <div className="page-shell player-chat-page">
      <div className="container player-chat-container">
        <Link to="/my-entries" className="back-link">
          <ArrowLeft size={15} /> MY ENTRIES
        </Link>
        <div className="chat-page-heading">
          <div>
            <span className="section-kicker">
              <span>// YOUR PRIVATE LINE</span>
            </span>
            <h1>
              CHAT WITH <span>THE ORGANIZER.</span>
            </h1>
            <p>
              Get server IP, match details and updates for your confirmed entry.
            </p>
          </div>
          <span className="chat-heading-icon">
            <LockKeyhole size={22} />
          </span>
        </div>
        <ChatConversation entryId={id} role="player" key={id} />
      </div>
    </div>
  );
}
