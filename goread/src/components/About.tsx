import { useNavigate } from '../hooks/useNavigate';
import { BackIcon, Header, HeaderButton } from 'rams';
import './About.css';

export const About = () => {
    const navigate = useNavigate();

    return (
        <>
            <Header>
                <HeaderButton onClick={() => navigate('/', { back: true })}>
                    <BackIcon />
                </HeaderButton>
            </Header>
            <div class="about-container">
                <h1>About Goread</h1>
                <div class="about-content">
                    <p>Description under development. Please come back later.</p>
                </div>
            </div>
        </>
    );
};

export default About;
