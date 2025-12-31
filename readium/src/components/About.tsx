import { useNavigate } from "../hooks/useNavigate";
import { BackIcon, Header, HeaderButton } from "rams";

export const About = () => {
  const navigate = useNavigate();

  return (
    <>
      <Header>
        <HeaderButton onClick={() => navigate("/", { back: true })}>
          <BackIcon />
        </HeaderButton>
      </Header>
      <div class="page-container">
        <div class="page-content">
          <h1>About Readium</h1>
          <p>Description under development. Please come back later.</p>
        </div>
      </div>
    </>
  );
};

export default About;
