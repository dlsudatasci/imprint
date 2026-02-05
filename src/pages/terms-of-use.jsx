import Page from '@/ui/page';
import { H1 } from '@/ui/Typography';
import Link from 'next/link';
// import { H2 } from '@/ui/Typography';
import { H3 } from '@/ui/Typography';
import { P } from '@/ui/Typography';

export default function Index() {
    return (
        <Page
            title="Terms of Use - Imprint"
            description="This is our terms of use and privacy policy for using Imprint."
            contribute={false}
        >
            <section className='container mx-auto px-5'>
                <div className='mx-16'>
                    <H1>Terms of Use and Privacy Policy </H1>
                    <br />
                    <P className="text-xl mb-2">This terms of use and privacy policy will help you understand how 
                        <Link href="https://dlsucomet.github.io/" target="_blank" className="text-primary hover:underline"> Human-X Interaction Lab </Link>
                       and student researchers will use and
                        protect the data you provide to us when you visit and use Imprint. </P>
                    <br />
                    <H3 className="mb-2"> Overview</H3> 
                    <P> Greetings! I am Francis Bawa and I'm currently working on my Master's thesis at De La Salle University titled &quot;Leveraging Human-in-the-Loop Crowdsourcing to 
                        Support Richer Human Perception Data Collection in Streetscape Evaluation&quot;. In this study, I'm trying to ....</P>
                    
                    <br />
                    <H3 className="mb-2"> Procedure</H3>
                    <P> Register to Imprint through the &quot;Contribute&quot; Page, and provide the following:</P>
                    <div className="mx-5">
                        <P> •	Username </P>
                        <P> •	Email address </P>
                        <P> •	Password </P>
                        <P> •	City of Residence </P>
                        <P> •	Frequently Walked Cities </P>
                        <P> •	Age </P>
                        <P> •	Frequency of walking during your usual commute</P>
                    </div>
                    <br />
                    <P> After registering for annotation task, you may continue on to annotate street view images in the website.
                        You are to:  </P>
                    <div className="mx-5">
                        <P> •	Select obstructions that can be found along the sidewalk </P>
                        <P> •	Create new bounding boxes around obstructions that have not yet been annotated. </P>
                        <P> •	Rate the sidewalk accessibility from 1 to 10.  </P>
                        <P> •	Determine the surface type of the sidewalk, or if there is no sidewalk present in the image.</P>
                    </div>
                    <br />
                    <H3 className="mb-2"> Informed Consent</H3>
                    <P> By participating in our study, you agree to the following: </P>
                    <div className="mx-5">
                        <P> •	I agree to participate in the data collection procedure of this study.</P>
                        <P> •	I have read and understood the background of the research and procedure for the annotation task,
                            as indicated in the overview and procedure section.</P>
                        <P> •	I acknowledge that I have been provided with the opportunity to ask questions and request for
                            clarifications regarding the research study.</P>
                        <P> •	I understand that my participation is completely voluntary and that I have the right to withdraw
                            my participation at any time.</P>
                        <P> •	I understand that all my user data will be kept confidential and will only be used by the proponents
                            of this research. </P>
                    </div>
                    <br />
                    <H3 className="mb-2"> What User Data Imprint Collects</H3>
                    <P> When you visit the website, Imprint may collect the following data: </P>
                    <div className="mx-5">
                        <P> •	Your email address and password used for this website.</P>
                        <P> •	Other information such as city of residence, frequently walked cities, age, usage of mobility aids, frequency of commuting in a public
                            utility vehicle.</P>
                        <P> •	Your user activities such as the images you will annotate using our website.</P>
                    </div>
                    <br />
                    <H3 className="mb-2"> Why Imprint Collects Your Data</H3>
                    <P> Imprint collectss your data for several reasons: </P>
                    <div className="mx-5">
                        <P> •	To better understand the profile / background of our users.</P>
                        <P> •	To improve our research on the accessibility of sidewalks in the Philippines.</P>
                    </div>
                    <br />
                    <H3 className="mb-2"> Safeguarding and Securing the Data</H3>
                    <P> The student researchers are committed to securing your data and keeping it confidential.
                        They have done all in its power to prevent data theft, unauthorized access, and disclosure by implementing the latest
                        technologies and software, which help safeguard all the information Imprint collect. The student researchers will not lease,
                        sell or distribute your personal information to any third parties, all the information will solely be for the purpose of
                        our research.</P>
                    <br />
                    <H3 className="mb-2"> Restricting the Collection of your Personal Data</H3>
                    <P> At some point, you might wish to restrict the use and collection of your personal data. If you have already agreed to share your information with us, feel free to contact via email, and I will be more than happy to change this for you.</P>
                    <br />
                    <br />
                </div>
            </section>
        </Page>
    );
}
